// A small QR code encoder (Prompt 76) for the coach's join link: byte mode, error correction level
// M, versions 1-6 (up to 106 bytes - a join link is ~40). No dependency. Follows ISO/IEC 18004; the
// structure mirrors Project Nayuki's reference encoder (MIT). Output is a square matrix of booleans
// (true = dark), rendered by components/QrCode.tsx as one SVG path.

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16]; // index = version
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4];
const MAX_VERSION = 6;
const FORMAT_ECL_M = 0; // format-bit value for level M

/** Total codewords a version holds (data + error correction). */
function rawCodewords(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2;
    r -= (25 * na - 10) * na - 55;
  }
  return Math.floor(r / 8);
}

// ---- Reed-Solomon over GF(256), polynomial 0x11D ----
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

/** Splits data into blocks, appends ECC per block, and interleaves (ISO 18004 8.6). */
function addEccAndInterleave(data: number[], ver: number): number[] {
  const numBlocks = BLOCKS_M[ver];
  const blockEccLen = ECC_PER_BLOCK_M[ver];
  const raw = rawCodewords(ver);
  const numShortBlocks = numBlocks - (raw % numBlocks);
  const shortBlockLen = Math.floor(raw / numBlocks);
  const blocks: number[][] = [];
  const divisor = rsDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0); // placeholder so all blocks line up
    blocks.push(dat.concat(ecc));
  }
  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]);
    });
  }
  return result;
}

function appendBits(val: number, len: number, bb: number[]): void {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

export type QrMatrix = { size: number; version: number; mask: number; modules: boolean[][] };

/** Encodes `text` (UTF-8) as a QR code, level M, smallest version 1-6 that fits. Throws if too long. */
export function encodeQr(text: string, forceMask?: number): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= MAX_VERSION; ver++) {
    const dataBits = (rawCodewords(ver) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver]) * 8;
    if (4 + 8 + bytes.length * 8 <= dataBits) break;
  }
  if (ver > MAX_VERSION) throw new Error("Text is too long for a QR code here.");
  const dataCapBits = (rawCodewords(ver) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver]) * 8;

  // Data bit stream: byte mode (0100), 8-bit count (versions 1-9), the bytes, terminator, padding.
  const bb: number[] = [];
  appendBits(0b0100, 4, bb);
  appendBits(bytes.length, 8, bb);
  for (const b of bytes) appendBits(b, 8, bb);
  appendBits(0, Math.min(4, dataCapBits - bb.length), bb);
  appendBits(0, (8 - (bb.length % 8)) % 8, bb);
  for (let pad = 0xec; bb.length < dataCapBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bb);
  const dataCodewords: number[] = [];
  for (let i = 0; i < bb.length; i += 8) dataCodewords.push(parseInt(bb.slice(i, i + 8).join(""), 2));

  const size = ver * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // Finder patterns (+ separators).
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  // Alignment patterns (versions 2-6 have one, at 6 and size-7 positions).
  if (ver >= 2) {
    const pos = [6, size - 7];
    for (const ax of pos)
      for (const ay of pos) {
        if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
  }
  // Reserve the format areas (drawn properly later) and the dark module.
  const drawFormat = (mask: number) => {
    const data = (FORMAT_ECL_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true); // the dark module
    return bits;
  };
  drawFormat(0);

  // Codewords in the zig-zag order.
  const allCodewords = addEccAndInterleave(dataCodewords, ver);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < allCodewords.length * 8) {
          modules[y][x] = ((allCodewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  const maskBit = (mask: number, x: number, y: number): boolean => {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  };
  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFunction[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x];
  };

  let mask = forceMask ?? -1;
  if (mask < 0) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m);
      drawFormat(m);
      const p = penalty(modules);
      if (p < best) {
        best = p;
        mask = m;
      }
      applyMask(m); // undo (XOR)
    }
  }
  applyMask(mask);
  drawFormat(mask);
  return { size, version: ver, mask, modules };
}

/** ISO 18004 mask penalty (rules 1-4), used to choose the most readable mask. */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let result = 0;
  const lineRuns = (get: (i: number) => boolean) => {
    let score = 0;
    let runColor = get(0);
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (get(i) === runColor) run++;
      else {
        if (run >= 5) score += run - 2;
        runColor = get(i);
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
    return score;
  };
  for (let y = 0; y < n; y++) result += lineRuns((x) => m[y][x]);
  for (let x = 0; x < n; x++) result += lineRuns((y) => m[y][x]);
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
    }
  // Finder-like 1:1:3:1:1 patterns with 4 light on one side.
  const pat = [true, false, true, true, true, false, true];
  const finderLike = (get: (i: number) => boolean) => {
    let s = 0;
    for (let i = 0; i + 7 <= n; i++) {
      if (!pat.every((v, k) => get(i + k) === v)) continue;
      const before = i >= 4 && [1, 2, 3, 4].every((k) => !get(i - k));
      const after = i + 11 <= n && [7, 8, 9, 10].every((k) => !get(i + k));
      if (before || after) s += 40;
    }
    return s;
  };
  for (let y = 0; y < n; y++) result += finderLike((x) => m[y][x]);
  for (let x = 0; x < n; x++) result += finderLike((y) => m[y][x]);
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  const total = n * n;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * 10;
  return result;
}
