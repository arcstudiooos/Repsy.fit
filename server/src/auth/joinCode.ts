// Coach join codes (Prompt 76): one code per coach that clients use to sign up under that coach.
// Format: up to 4 letters from the coach's name (A-Z, padded with X) + "-" + 6 random characters
// from an alphabet with no look-alikes (no 0/O, 1/I/L), e.g. ANNA-7K2Q8M. 31^6 ~ 887 million random
// parts, plus the public lookup is rate limited, so codes cannot be guessed.
import crypto from "node:crypto";

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 characters
export const RANDOM_LENGTH = 6;
export const JOIN_CODE_RE = /^[A-Z]{4}-[2-9A-HJKMNP-Z]{6}$/;

/** The 4-letter name prefix: letters only, upper-case, padded with X ("Jo" -> "JOXX", "" -> "XXXX"). */
export function namePrefix(name: string): string {
  const letters = name
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return (letters + "XXXX").slice(0, 4);
}

/** A fresh code for this coach name. `random` is injectable for tests. */
export function newJoinCode(name: string, random: (n: number) => Buffer = crypto.randomBytes): string {
  // Rejection sampling: bytes >= 248 (8 * 31) are dropped, so every character is equally likely.
  let out = "";
  while (out.length < RANDOM_LENGTH) {
    for (const b of random(RANDOM_LENGTH * 2)) {
      if (b < 248 && out.length < RANDOM_LENGTH) out += CODE_ALPHABET[b % 31];
    }
  }
  return `${namePrefix(name)}-${out}`;
}

/** How a typed or linked code is looked up: trimmed and upper-cased (codes are stored upper-case). */
export function normalizeJoinCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return JOIN_CODE_RE.test(code) ? code : null;
}
