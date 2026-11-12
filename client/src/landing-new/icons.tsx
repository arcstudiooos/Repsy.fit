// Small stroke icons and pen-drawn arrows for the Studio landing. Inline SVG, no icon library.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const PATHS: Record<string, React.ReactNode> = {
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />,
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.6} />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 5 12L17 12h4" />,
  chart: <path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L20 7" />,
  doc: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  flame: <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.3-5.4 3.6-7.9.5 1.8 1.6 3 2.9 3.4C12 7.3 13.2 5 14.9 3c.4 3.7 3.6 5.6 3.6 10.3C18.5 17.8 15.8 21 12 21z" />,
  inbox: (
    <>
      <path d="M4 13l2-8h12l2 8v6H4z" />
      <path d="M4 13h4.5l1 2h5l1-2H20" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />,
  arrow: <path d="M7 17 17 7M9 7h8v8" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth={2.6} />,
  cross: <path d="M7 7l10 10M17 7 7 17" />,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />,
  link: <path d="M10 14a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4L11.5 6M14 10a4.5 4.5 0 0 0-6.4 0L5 12.6A4.5 4.5 0 0 0 11.4 19l1.1-1" />,
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth={2.6} />,
};

export function Icon({ name, size = 18, className = "", style }: { name: keyof typeof PATHS | string; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} style={style} {...P}>
      {PATHS[name]}
    </svg>
  );
}

/** A loose pen arrow for handwritten notes. `dir` = which way the head points. */
export function PenArrow({ dir = "left", className = "" }: { dir?: "left" | "right" | "down" | "up"; className?: string }) {
  const rotate = { left: 0, right: 180, down: -90, up: 90 }[dir];
  return (
    <svg
      width="44"
      height="26"
      viewBox="0 0 44 26"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ transform: `rotate(${rotate}deg)` }}
      {...P}
      strokeWidth={2}
    >
      <path d="M41 19C30 22 15 20 6 9" />
      <path d="M5 17 6 9l8 1" />
    </svg>
  );
}

/** The scribbled underline under "Let Repsy handle it." Drawn on scroll (data-draw). */
export function Scribble({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 220 22" aria-hidden="true" focusable="false" className={className} style={style} fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round">
      <path data-draw d="M4 14C40 6 96 4 150 8c22 1.6 44 4 64 8" />
      <path data-draw d="M32 18c38-4 92-5 138-2" strokeWidth={2.2} />
    </svg>
  );
}
