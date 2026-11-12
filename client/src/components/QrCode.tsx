import { useMemo } from "react";
import { encodeQr } from "../lib/qr";

/** A QR code as one SVG path (dark modules), with the 4-module quiet zone, ink on --white. */
export function QrCode({ text, label, size = 168 }: { text: string; label: string; size?: number }) {
  // A text too long for version 6 (a very long APP_URL) leaves the QR out rather than crashing the page.
  const qr = useMemo(() => {
    try {
      return encodeQr(text);
    } catch {
      return null;
    }
  }, [text]);
  if (!qr) return <p className="text-xs text-dim">This link is too long for a QR code. Share the link instead.</p>;
  const quiet = 4;
  const dim = qr.size + quiet * 2;
  let d = "";
  qr.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }),
  );
  return (
    <svg
      role="img"
      aria-label={label}
      data-modules={qr.size}
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="rounded-lg bg-white"
      style={{ border: "1px solid var(--border)" }}
    >
      {/* Always dark ink (--on-accent is #141414 in both themes) on --white: phone cameras need dark-on-light. */}
      <path d={d} fill="var(--on-accent)" />
    </svg>
  );
}
