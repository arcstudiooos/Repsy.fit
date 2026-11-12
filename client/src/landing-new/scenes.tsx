// The Studio landing's sections, top to bottom. Motion is added by motion.ts through the
// data-* hooks; without it (reduced motion, phones, or before GSAP loads) every section is a
// complete, readable still frame.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import LeadForm from "../landing/LeadForm";
import {
  BEATS,
  CHAOS,
  COMPARE,
  FAQ_CHAT,
  FEED,
  MORE,
  PLANS,
  PLATES,
  RIBBON,
  ROAD,
  TANGLE,
} from "./content";
import { Icon, PenArrow, Scribble } from "./icons";

/* ======================================================================================
 * HERO: the barbell. Repsy's four plan types are the four plates, one per client. On scroll the
 * plates slide onto the sleeves, the collars lock, the bar whips under the load, and four ticks
 * land: lifted. Without motion it is shown fully loaded.
 * ==================================================================================== */

const BAR = {
  w: 960,
  h: 290,
  y: 150,
  sleeve: 250,
  plateT: 26,
  gap: 3,
  plateH: 200,
};

/** Bar as a path so it can bend: both ends droop by `sag`, the middle stays put. */
export function barPath(sag: number): string {
  const { w, y } = BAR;
  return `M 24 ${y + sag} Q ${w / 2} ${y - sag * 0.6} ${w - 24} ${y + sag}`;
}

/** Mix helpers for the shaded faces (tints of the plate's own colour, no new hex values). */
const shade = (c: string, pct: number) =>
  `color-mix(in srgb, var(--ink) ${pct}%, ${c})`;
const tint = (c: string, pct: number) =>
  `color-mix(in srgb, var(--paper) ${pct}%, ${c})`;

/**
 * A bumper plate seen in three-quarter view from the middle of the bar: the disc is an ellipse
 * (foreshortened), its thickness runs along the sleeve. `x` is the INNER face's centre and the
 * thickness extends outward (-x), so the big inner plate is in front and the smaller ones show
 * behind it, as on a loaded bar seen from the lifter's side.
 */
function Plate({
  x,
  color,
  h,
  kg,
  flip,
}: {
  x: number;
  color: string;
  h: number;
  kg: number;
  flip: boolean;
}) {
  const { y, plateT } = BAR;
  const ry = h / 2;
  const rx = ry * 0.3; // how round the disc looks
  const t = plateT;
  return (
    <g>
      {/* rim (the thickness): a band from the back face to the front face */}
      <path
        d={`M ${x - t} ${y - ry} A ${rx} ${ry} 0 0 0 ${x - t} ${y + ry} L ${x} ${y + ry} A ${rx} ${ry} 0 0 1 ${x} ${y - ry} Z`}
        fill={shade(color, 28)}
      />
      <path
        d={`M ${x - t} ${y - ry} A ${rx} ${ry} 0 0 1 ${x - t} ${y + ry} L ${x} ${y + ry} A ${rx} ${ry} 0 0 0 ${x} ${y - ry} Z`}
        fill={shade(color, 16)}
      />
      {/* front face */}
      <ellipse
        cx={x}
        cy={y}
        rx={rx}
        ry={ry}
        fill={color}
        stroke={shade(color, 35)}
        strokeWidth="1.5"
      />
      {/* raised inner ring + bevel highlight */}
      <ellipse
        cx={x}
        cy={y}
        rx={rx * 0.68}
        ry={ry * 0.68}
        fill="none"
        stroke={shade(color, 22)}
        strokeWidth="2"
      />
      <ellipse
        cx={x}
        cy={y}
        rx={rx * 0.62}
        ry={ry * 0.62}
        fill="none"
        stroke={tint(color, 30)}
        strokeWidth="1.2"
      />
      <path
        d={`M ${x - rx * 0.55} ${y - ry * 0.75} A ${rx * 0.9} ${ry * 0.9} 0 0 1 ${x + rx * 0.2} ${y - ry * 0.95}`}
        fill="none"
        stroke={tint(color, 55)}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* steel hub */}
      <ellipse
        cx={x}
        cy={y}
        rx={rx * 0.26}
        ry={ry * 0.26}
        fill="var(--dark-3)"
        stroke="var(--ink)"
        strokeWidth="1.5"
      />
      <ellipse cx={x} cy={y} rx={rx * 0.12} ry={ry * 0.12} fill="var(--ink)" />
      {/* printed weight on the lower half of the face */}
      {/* the right sleeve is a mirrored copy, so un-mirror the print there */}
      <g transform={flip ? `translate(${2 * x} 0) scale(-1 1)` : undefined}>
        <text
          x={x}
          y={y + ry * 0.56}
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontWeight="700"
          fontSize={Math.max(11, ry * 0.2)}
          fill={shade(color, 45)}
        >
          {kg}
        </text>
        <text
          x={x}
          y={y + ry * 0.56 + Math.max(9, ry * 0.12)}
          textAnchor="middle"
          fontFamily="var(--mono)"
          fontWeight="700"
          fontSize={Math.max(6, ry * 0.08)}
          fill={shade(color, 45)}
        >
          KG
        </text>
      </g>
    </g>
  );
}

/** A cylinder along the bar (sleeve, collar): a body plus an elliptical end cap. */
function Cylinder({
  x1,
  x2,
  r,
  fill,
  cap,
}: {
  x1: number;
  x2: number;
  r: number;
  fill: string;
  cap: string;
}) {
  const { y } = BAR;
  const rx = r * 0.3;
  return (
    <g>
      <rect x={x1} y={y - r} width={x2 - x1} height={r * 2} fill={fill} />
      <ellipse cx={x2} cy={y} rx={rx} ry={r} fill={fill} />
      <ellipse cx={x1} cy={y} rx={rx} ry={r} fill={cap} />
    </g>
  );
}

const KG = [25, 20, 15, 10];

function Barbell() {
  const { w, h, y, sleeve, plateT, gap, plateH } = BAR;
  // Plate i's inner face sits at slot[i]; plate 0 rests against the shoulder. Drawn outermost
  // first so the inner plates overlap them.
  const slots = PLATES.map((_, i) => sleeve - i * (plateT + gap));
  const outer = sleeve - PLATES.length * (plateT + gap);
  const order = PLATES.map((_, i) => i).reverse();
  return (
    <svg
      data-barbell
      viewBox={`0 0 ${w} ${h}`}
      className="block h-auto w-full overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="ln-steel"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={y - 12}
          x2="0"
          y2={y + 12}
        >
          <stop offset="0" stopColor="var(--dark-3)" />
          <stop offset="0.45" stopColor="var(--ink)" />
          <stop offset="1" stopColor="var(--dark-2)" />
        </linearGradient>
        <linearGradient
          id="ln-sleeve"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={y - 12}
          x2="0"
          y2={y + 12}
        >
          <stop
            offset="0"
            stopColor="color-mix(in srgb, var(--paper) 40%, var(--ink))"
          />
          <stop offset="0.5" stopColor="var(--dark-3)" />
          <stop offset="1" stopColor="var(--ink)" />
        </linearGradient>
        <pattern
          id="ln-knurl"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M0 6 6 0M-1 1 1 -1M5 7 7 5"
            stroke="var(--dark-3)"
            strokeWidth="0.8"
          />
        </pattern>
      </defs>
      <ellipse
        data-bar-shadow
        cx={w / 2}
        cy={h - 10}
        rx={w * 0.4}
        ry="6"
        fill="var(--ink)"
        opacity="0.08"
      />
      {/* shaft */}
      <g data-bar-group>
        <path
          data-bar
          d={barPath(0)}
          fill="none"
          stroke="url(#ln-steel)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          data-bar-knurl
          d={barPath(0)}
          fill="none"
          stroke="url(#ln-knurl)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray="150 60 150 1000"
          strokeDashoffset="-250"
          opacity="0.5"
        />
      </g>
      {/* sleeves, plates, collars - the right side is the left mirrored */}
      {[0, 1].map((side) => {
        const flip = side === 1;
        return (
          <g
            key={side}
            transform={flip ? `translate(${w} 0) scale(-1 1)` : undefined}
          >
            {/* inner group: motion.ts bends this one (translate + rotate about the shoulder) */}
            <g data-sleeve={side}>
              <Cylinder
                x1={30}
                x2={sleeve}
                r={11}
                fill="url(#ln-sleeve)"
                cap="var(--dark-3)"
              />
              {/* shoulder: the step the first plate rests against */}
              <Cylinder
                x1={sleeve - 4}
                x2={sleeve + 10}
                r={20}
                fill="var(--ink)"
                cap="var(--dark-2)"
              />
              {order.map((i) => (
                <g
                  key={PLATES[i].type}
                  data-plate={flip ? i + 4 : i}
                  data-plate-side={side}
                  data-plate-index={i}
                >
                  <Plate
                    x={slots[i]}
                    color={PLATES[i].color}
                    h={plateH * PLATES[i].h}
                    kg={KG[i]}
                    flip={flip}
                  />
                </g>
              ))}
              <g data-collar={side}>
                <Cylinder
                  x1={outer - 26}
                  x2={outer - 4}
                  r={17}
                  fill="var(--dark-2)"
                  cap="var(--ink)"
                />
                <rect
                  x={outer - 24}
                  y={y - 26}
                  width="8"
                  height="14"
                  rx="2"
                  fill="var(--ink)"
                />
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export function Hero() {
  return (
    <section
      id="top"
      data-scene="hero"
      aria-labelledby="ln-hero-title"
      className="relative"
    >
      <div
        data-hero-pin
        className="ln-wrap flex min-h-[100svh] flex-col justify-center gap-8 pb-20 pt-24 lg:gap-4 lg:pb-8"
      >
        <div data-hero-copy className="relative z-10 max-w-[44rem]">
          <h1
            id="ln-hero-title"
            className="ln-display text-[clamp(3.2rem,7vw,6rem)]"
          >
            <span className="sr-only">Repsy Coach: </span>
            Load the week.
            <br />
            Watch it get <span className="ln-key">lifted.</span>
          </h1>
          <p className="ln-lead mt-5 max-w-[34rem]">
            Every client's week on one bar: workout, nutrition, habits,
            recovery. Load it on Monday with the reasoning attached, mark it
            done as they train, and the check-ins chart themselves.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <a href="#get" className="ln-btn">
              Start free
            </a>
            <a href="#how" className="ln-btn-ghost">
              See how it works
            </a>
          </div>
        </div>

        <div data-hero-column className="relative mx-auto w-full max-w-[900px]">
          <Barbell />
          {/* plate labels: who each plate is for */}
          <ul
            className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4"
            aria-label="This week's plans"
          >
            {PLATES.map((p) => (
              <li
                key={p.type}
                data-plate-label
                className="flex items-center gap-2.5"
              >
                <span
                  data-plate-tick
                  className="ln-avatar h-7 w-7 opacity-0"
                  style={{ background: "var(--teal)" }}
                >
                  <Icon name="check" size={13} />
                </span>
                <span
                  className="h-7 w-2 flex-none rounded-full"
                  style={{ background: p.color }}
                />
                <span className="leading-tight">
                  <span className="block text-[0.9rem] font-bold">
                    {p.client}{" "}
                    <span style={{ color: "var(--mute)" }}>· {p.type}</span>
                  </span>
                  <span
                    className="ln-mono block text-[0.72rem]"
                    style={{ color: "var(--mute)" }}
                  >
                    {p.plan}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p
            data-hero-note
            className="ln-hand absolute right-[12%] -top-8 hidden rotate-[6deg] text-[1.6rem] lg:block"
            aria-hidden="true"
          >
            four plan types,
            <br />
            one bar
          </p>
          <p
            data-hero-note
            className="ln-hand absolute left-[2%] top-[62%] hidden items-center gap-2 text-[1.5rem] lg:flex"
            aria-hidden="true"
          >
            it bends when it's loaded
            <PenArrow dir="up" />
          </p>
          <p
            data-hero-count
            className="ln-mono absolute right-[2%] top-[8%] hidden rounded-full px-3 py-1 text-[12px] font-bold lg:block"
            style={{
              background: "var(--paper)",
              border: "1px solid var(--line)",
            }}
            aria-hidden="true"
          >
            <span data-hero-count-n>4</span> of 4 loaded
          </p>
        </div>
        <ul
          className="hidden flex-wrap gap-x-6 gap-y-2 text-[0.82rem] font-medium md:flex"
          style={{ color: "var(--mute)" }}
        >
          {[
            "7-day free trial",
            "Clients install nothing",
            "AI suggests, you decide",
          ].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Icon name="check" size={14} className="ln-tick" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ======================================================================================
 * RIBBON: a black band curving across the page with the promise scrolling along it.
 * ==================================================================================== */

export function Ribbon() {
  const text = RIBBON.repeat(4);
  return (
    <div className="relative -mt-6 overflow-hidden" aria-hidden="true">
      <svg
        viewBox="0 0 1440 260"
        className="ln-ribbon block h-auto w-[130%] max-w-none -translate-x-[11%]"
        preserveAspectRatio="xMidYMid meet"
      >
        <path
          id="ln-ribbon-path"
          d="M -120 230 Q 720 -40 1560 230"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="96"
        />
        <text dy="16">
          <textPath data-ribbon href="#ln-ribbon-path" startOffset="0">
            {text}
          </textPath>
        </text>
      </svg>
    </div>
  );
}

/* ======================================================================================
 * INTRO: the problem in two tones, then the turn.
 * ==================================================================================== */

export function Intro() {
  return (
    <section
      id="why"
      className="ln-wrap scroll-mt-24 py-24 text-center md:py-32"
    >
      <h2 data-rise className="ln-h2 mx-auto max-w-4xl">
        Sunday night. Twelve clients.
        <br />
        <span className="ln-dim">Now comes the spreadsheet.</span>
      </h2>
      <p data-rise className="ln-h2 relative mx-auto mt-12 inline-block">
        Let <span className="ln-key">Repsy</span> handle it.
        <Scribble
          className="absolute -bottom-5 left-1/2 w-[46%] -translate-x-1/3"
          style={{ color: "var(--orange)" }}
        />
      </p>
      <p
        data-rise
        className="mt-10 text-lg font-medium"
        style={{ color: "var(--mute)" }}
      >
        (so you never have to text: did you train today?)
      </p>
      <p
        data-rise
        className="ln-hand mt-20 inline-flex flex-col items-center text-[1.7rem]"
        aria-hidden="true"
      >
        why coaches love it
        <PenArrow dir="down" className="mt-1" />
      </p>
    </section>
  );
}

/* ======================================================================================
 * ROAD: a white road that draws itself down the page, with each feature placed along it.
 * ==================================================================================== */

function FeatureCard({ f }: { f: (typeof ROAD)[number] }) {
  return (
    <div
      data-rise
      className="ln-card relative mx-auto max-w-[400px] px-8 pb-9 pt-12 text-center"
    >
      <span className="ln-icon absolute -top-5 left-1/2 -translate-x-1/2 shadow-sm">
        <Icon name={f.icon} />
      </span>
      <h3 className="ln-cond text-[clamp(2rem,3.6vw,2.75rem)]">
        {f.title[0]}
        <br />
        {f.title[1]}
      </h3>
      <p
        className="mt-4 text-[0.9rem] leading-relaxed"
        style={{ color: "var(--mute)" }}
      >
        {f.body}
      </p>
    </div>
  );
}

function AiMock() {
  return (
    <div
      data-rise
      className="ln-white mx-auto w-full max-w-[360px] p-4 text-left"
    >
      <div
        className="flex items-center gap-2 border-b pb-3"
        style={{ borderColor: "var(--line)" }}
      >
        <span className="ln-avatar">MP</span>
        <div>
          <p className="text-[0.85rem] font-bold">AI Coach</p>
          <p className="ln-who">Maya Patel · Strength · Intermediate</p>
        </div>
      </div>
      <p className="ln-bubble ln-bubble-dark ml-auto mt-3 w-fit">
        Make a push day for Maya
      </p>
      <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--bg)" }}>
        <p
          className="ln-mono text-[11px] font-bold tracking-wider"
          style={{ color: "var(--orange-deep)" }}
        >
          SUGGESTED · WORKOUT
        </p>
        <p className="mt-1 font-bold">Push day · Week 3</p>
        <p className="ln-mono mt-2 text-[12px] leading-relaxed">
          1. Bench Press 4 × 8 · Rest 90s
          <br />
          2. Overhead Press 3 × 10 · Rest 90s
        </p>
        <p
          className="mt-2 rounded-xl px-3 py-2 text-[12px]"
          style={{ background: "var(--paper)" }}
        >
          <b>Why:</b> bench has stalled for 3 weeks, so more volume at RPE 7.
        </p>
        <span
          className="ln-chip mt-3"
          style={{ background: "var(--orange)", color: "var(--ink)" }}
        >
          Assign
        </span>
      </div>
    </div>
  );
}

function DoseMock() {
  return (
    <div data-rise className="ln-white mx-auto w-full max-w-[330px] p-5">
      <div className="flex items-center justify-between">
        <p className="font-bold">Leg day</p>
        <span className="ln-tag ln-tag-workout">Workout</span>
      </div>
      <div className="ln-mono mt-4 space-y-2 text-[12.5px]">
        {[
          ["1. Back Squat", "4 sets × 6 reps", "Rest 120s"],
          ["2. Romanian Deadlift", "3 sets × 10 reps", "Rest 90s"],
          ["3. Walking Lunge", "3 sets × 12 reps", "Rest 60s"],
        ].map(([a, b, c]) => (
          <div
            key={a}
            className="rounded-xl px-3 py-2"
            style={{ background: "var(--bg)" }}
          >
            <p className="font-bold">{a}</p>
            <p style={{ color: "var(--mute)" }}>
              {b} · {c}
            </p>
          </div>
        ))}
      </div>
      <p
        className="mt-4 text-center text-[11px]"
        style={{ color: "var(--mute)" }}
      >
        saved exactly like this
      </p>
    </div>
  );
}

function LiveMock() {
  return (
    <div data-rise className="relative mx-auto w-full max-w-[360px]">
      <div className="ln-white space-y-2 p-3">
        {[
          ["Leg day", "Maya · Done"],
          ["Push day", "Arjun · Done"],
          ["Check-in", "Casey · 6-day streak"],
        ].map(([a, b], i) => (
          <div
            key={a}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ background: i === 0 ? "var(--bg)" : undefined }}
          >
            <span className="ln-avatar" style={{ background: "var(--teal)" }}>
              <Icon name="check" size={14} />
            </span>
            <div className="leading-tight">
              <p className="text-[0.85rem] font-bold">{a}</p>
              <p className="ln-who">{b}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="ln-dark mt-4 ml-6 rounded-2xl px-4 py-3">
        <div className="flex items-baseline justify-between">
          <p className="ln-display text-[1.6rem]">9 of 12</p>
          <p className="text-[11px] opacity-70">trained this week</p>
        </div>
        <div
          className="mt-2 h-1.5 rounded-full"
          style={{ background: "var(--dark-3)" }}
        >
          <div
            data-fill
            className="h-full rounded-full"
            style={{ width: "75%", background: "var(--orange)" }}
          />
        </div>
      </div>
    </div>
  );
}

function CheckinMock() {
  return (
    <div
      data-rise
      className="ln-white relative mx-auto w-full max-w-[340px] overflow-hidden p-5"
    >
      <div className="flex items-baseline justify-between">
        <p className="font-bold">Arjun · weight</p>
        <p className="ln-mono text-[12px]">82.4 → 80.9 kg</p>
      </div>
      <svg viewBox="0 0 300 110" className="mt-3 w-full" aria-hidden="true">
        {[22, 55, 88].map((y) => (
          <line
            key={y}
            x1="0"
            x2="300"
            y1={y}
            y2={y}
            stroke="var(--line)"
            strokeDasharray="3 5"
          />
        ))}
        <path
          data-draw
          d="M5 30 C 40 34, 60 26, 90 44 S 150 52, 180 62 S 240 70, 295 84"
          fill="none"
          stroke="var(--teal)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {[
          [5, 30],
          [90, 44],
          [180, 62],
          [295, 84],
        ].map(([x, y]) => (
          <circle
            key={x}
            cx={x}
            cy={y}
            r="4.5"
            fill="var(--paper)"
            stroke="var(--teal)"
            strokeWidth="2.5"
          />
        ))}
      </svg>
      <div
        className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
        style={{
          background: "color-mix(in srgb, var(--amber) 14%, var(--paper))",
        }}
      >
        <Icon name="bell" size={15} style={{ color: "var(--amber)" }} />
        <span>
          <b>Needs attention:</b> Leo · adherence 58% over 2 weeks
        </span>
      </div>
      {/* the scan line that sweeps the chart (motion.ts moves it) */}
      <div
        data-scan
        className="pointer-events-none absolute inset-x-0 top-14 h-[2px]"
        style={{
          background: "var(--orange)",
          boxShadow: "0 0 18px 6px var(--card)",
        }}
      />
    </div>
  );
}

const MOCKS = {
  ai: AiMock,
  dose: DoseMock,
  live: LiveMock,
  checkins: CheckinMock,
} as const;

const ROAD_OVERRUN = 420;

export function Road() {
  const sectionRef = useRef<HTMLElement>(null);
  const [geom, setGeom] = useState<{ w: number; h: number; d: string } | null>(
    null,
  );

  // The road is drawn from the real layout: one bend per feature row, so it always meets the cards.
  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const build = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const rows = [...el.querySelectorAll<HTMLElement>("[data-road-row]")].map(
        (r) => r.offsetTop + r.offsetHeight / 2,
      );
      const left = w * 0.12;
      const right = w * 0.88;
      let d = `M ${w * 0.5} 0 C ${w * 0.5} ${rows[0] * 0.4}, ${right} ${rows[0] * 0.5}, ${right} ${rows[0]}`;
      rows.forEach((y, i) => {
        const from = i % 2 === 0 ? right : left;
        const to = i % 2 === 0 ? left : right;
        if (i < rows.length - 1) {
          const next = rows[i + 1];
          const mid = (y + next) / 2;
          d += ` C ${from} ${mid}, ${to} ${mid}, ${to} ${next}`;
        } else {
          // After the last card the road swings back to the middle and runs on out of the section,
          // under the next one, instead of stopping in mid-air.
          const exit = h + ROAD_OVERRUN;
          d += ` C ${from} ${y + (exit - y) * 0.45}, ${w * 0.5} ${y + (exit - y) * 0.55}, ${w * 0.5} ${exit}`;
        }
      });
      setGeom({ w, h: h + ROAD_OVERRUN, d });
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section
      id="how"
      ref={sectionRef}
      data-scene="road"
      aria-labelledby="ln-how-title"
      className="relative scroll-mt-24 pb-24"
    >
      {geom && (
        <svg
          className="ln-road pointer-events-none absolute left-0 top-0 hidden md:block"
          width={geom.w}
          height={geom.h}
          viewBox={`0 0 ${geom.w} ${geom.h}`}
          aria-hidden="true"
        >
          {/* The lane draws on scroll (motion.ts). The dashed centre line is clipped to a rectangle
              that motion.ts keeps level with the lane's drawing tip, so it appears as the lane does.
              Without motion the rectangle covers everything and the whole line shows. */}
          <defs>
            <clipPath id="ln-road-clip">
              <rect data-road-clip x="0" y="0" width={geom.w} height={geom.h} />
            </clipPath>
          </defs>
          <path data-road d={geom.d} pathLength={1000} strokeWidth="46" />
          <path
            data-road-line
            d={geom.d}
            strokeWidth="3"
            clipPath="url(#ln-road-clip)"
          />
        </svg>
      )}
      <h2 id="ln-how-title" className="sr-only">
        How it works
      </h2>
      <div className="ln-wrap relative space-y-28 md:space-y-40">
        {ROAD.map((f, i) => {
          const Mock = MOCKS[f.id];
          const flip = i % 2 === 1;
          return (
            <div
              key={f.id}
              data-road-row
              className="grid items-center gap-14 md:grid-cols-2 md:gap-10"
            >
              <div className={flip ? "md:order-2" : ""}>
                <FeatureCard f={f} />
                <p
                  className={
                    "ln-hand mt-6 flex items-center gap-2 text-[1.6rem] " +
                    (flip ? "justify-start md:pl-10" : "justify-end md:pr-10")
                  }
                  aria-hidden="true"
                >
                  {flip && <PenArrow dir="left" />}
                  {f.note}
                  {!flip && <PenArrow dir="right" />}
                </p>
              </div>
              <div className={flip ? "md:order-1" : ""}>
                <Mock />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ======================================================================================
 * PLAN TYPES: the same client, two kinds of plan. Workout from the Manual Planner, Nutrition
 * from the meal library and macro calculator - both real tabs.
 * ==================================================================================== */

const PLAN_VIEWS = {
  workout: {
    label: "Workout",
    title: "Leg day · Week 3",
    kicker: "Manual Planner",
    stat: ["4 moves", "52 min"],
    rows: [
      ["Back Squat", "4 × 6 · Rest 120s"],
      ["Romanian Deadlift", "3 × 10 · Rest 90s"],
      ["Walking Lunge", "3 × 12 · Rest 60s"],
      ["Calf Raise", "3 × 15 · Rest 60s"],
    ],
    foot: "Saved exactly like this, numbered.",
  },
  nutrition: {
    label: "Nutrition",
    title: "Cut · 2,100 kcal",
    kicker: "Meals + macros",
    stat: ["160 g protein", "4 meals"],
    rows: [
      ["Oats, whey, berries", "520 kcal · 38 g P"],
      ["Chicken rice bowl", "640 kcal · 48 g P"],
      ["Greek yoghurt, nuts", "310 kcal · 24 g P"],
      ["Paneer, dal, roti", "630 kcal · 50 g P"],
    ],
    foot: "Targets from the macro calculator; meals from your library.",
  },
} as const;

export function Currency() {
  const [kind, setKind] = useState<keyof typeof PLAN_VIEWS>("workout");
  const v = PLAN_VIEWS[kind];
  const tone = kind === "workout" ? "var(--orange)" : "var(--teal)";
  return (
    <section className="ln-wrap grid items-center gap-16 py-24 md:grid-cols-2 md:py-32">
      <div data-rise>
        <h2 className="ln-h2">
          Plans, the way
          <br />
          you <span className="ln-key">coach.</span>
        </h2>
        <p
          className="ln-h2 mt-8 text-[clamp(1.7rem,3vw,2.3rem)]"
          style={{ color: "var(--mute-2)" }}
        >
          Strength or nutrition?
        </p>
        <div className="mt-6 flex items-center gap-4">
          <div className="ln-toggle" role="group" aria-label="Plan type">
            {(["workout", "nutrition"] as const).map((k) => (
              <button
                key={k}
                type="button"
                data-type={k}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {PLAN_VIEWS[k].label}
              </button>
            ))}
          </div>
          <span
            className="ln-hand flex items-center gap-2 text-[1.5rem]"
            aria-hidden="true"
          >
            <PenArrow dir="left" />
            go on, tap it
          </span>
        </div>
        <p
          className="mt-6 max-w-sm text-[0.9rem]"
          style={{ color: "var(--mute)" }}
        >
          Workout, Nutrition, Habit and Recovery plans live side by side on one
          client. Build them by hand in the Manual Planner, from a Library
          template, or from an AI suggestion you approve.
        </p>
        <p className="sr-only" aria-live="polite">
          Showing the {v.label} plan
        </p>
      </div>
      <div data-rise className="flex justify-center">
        <div className="ln-phone">
          <span className="ln-notch" aria-hidden="true" />
          <div className="ln-phone-screen px-5 pb-6 pt-14">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[1.2rem] font-bold">Maya Patel</p>
                <p className="ln-who">{v.kicker}</p>
              </div>
              <span
                className={
                  "ln-tag " +
                  (kind === "workout" ? "ln-tag-workout" : "ln-tag-nutrition")
                }
              >
                {v.label}
              </span>
            </div>
            <div
              className="mt-4 rounded-2xl p-4"
              style={{ background: "var(--bg)" }}
            >
              <p className="ln-display text-[1.7rem] leading-none">{v.title}</p>
              <div className="mt-3 flex gap-2">
                {v.stat.map((s) => (
                  <span
                    key={s}
                    className="ln-mono rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: "var(--paper)" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <ol className="mt-4 space-y-2.5">
              {v.rows.map(([a, b], i) => (
                <li key={a} className="flex items-center gap-3">
                  <span
                    className="ln-avatar"
                    style={{
                      background: tone,
                      color: kind === "workout" ? "var(--ink)" : "var(--paper)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9rem] font-semibold">
                      {a}
                    </span>
                    <span
                      className="ln-mono block text-[0.76rem]"
                      style={{ color: "var(--mute)" }}
                    >
                      {b}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="ln-who mt-4">{v.foot}</p>
            <p
              className="mt-4 rounded-full py-3 text-center text-[0.85rem] font-bold"
              style={{
                background: "var(--orange)",
                color: "var(--ink)",
                boxShadow: "0 3px 0 var(--ink)",
              }}
            >
              Assign to Maya
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ======================================================================================
 * MORE: the features people find later.
 * ==================================================================================== */

const STICKER = [
  "var(--orange)",
  "var(--teal)",
  "var(--amber)",
  "var(--violet)",
];

export function More() {
  return (
    <section className="ln-wrap py-24 md:py-28">
      <h2 data-rise className="ln-h2 text-center">
        It does more than plan.
        <br />
        <span className="ln-dim">The bits you find later.</span>
      </h2>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MORE.map((m, i) => (
          <article key={m.title} data-rise className="ln-white p-6">
            <div className="flex items-center justify-between">
              <span
                className="ln-sticker"
                style={{ ["--c" as string]: STICKER[i % STICKER.length] }}
              >
                <Icon name={m.icon} size={24} />
              </span>
              <span className="ln-tag ln-tag-light">{m.tag}</span>
            </div>
            <h3 className="mt-6 text-[1.05rem] font-bold">{m.title}</h3>
            <p
              className="mt-2 text-[0.88rem] leading-relaxed"
              style={{ color: "var(--mute)" }}
            >
              {m.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ======================================================================================
 * COMPARE: the client chat chaos against one tidy table.
 * ==================================================================================== */

export function Compare() {
  return (
    <section className="ln-wrap py-12 md:py-16">
      <div
        data-rise
        className="ln-white grid overflow-hidden md:grid-cols-[0.85fr_1.15fr]"
      >
        <div
          className="relative min-h-[420px] overflow-hidden p-6"
          style={{ background: "var(--bg)" }}
        >
          <svg
            className="ln-road pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 400 520"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M 260 -20 C 330 120, 60 160, 120 290 S 330 420, 230 560"
              strokeWidth="38"
            />
          </svg>
          <div className="relative">
            <div
              className="flex items-center justify-between rounded-full px-4 py-2"
              style={{ background: "var(--paper)" }}
            >
              <span className="text-[0.82rem] font-bold">Clients</span>
              <span className="ln-tag ln-tag-dark">47 unread</span>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {CHAOS.map((c, i) => (
                <div
                  key={i}
                  data-pop
                  className={"ln-bubble " + (c.right ? "ml-auto" : "")}
                >
                  <p className="ln-who">{c.who}</p>
                  {c.text}
                </div>
              ))}
            </div>
            <p
              className="ln-hand mt-8 text-right text-[1.7rem]"
              aria-hidden="true"
            >
              sound familiar?
            </p>
          </div>
        </div>
        <div className="p-7 md:p-12">
          <h2 className="ln-h2 text-[clamp(2rem,3.8vw,2.9rem)]">
            <span className="ln-dim">More than a group chat.</span>
            <br />
            See the <span className="ln-key">difference.</span>
          </h2>
          <table className="mt-10 w-full text-left text-[0.88rem]">
            <thead>
              <tr className="border-b-2" style={{ borderColor: "var(--ink)" }}>
                <th
                  scope="col"
                  className="pb-3 text-[0.7rem] font-bold uppercase tracking-wider"
                  style={{ color: "var(--mute)" }}
                >
                  What you get
                </th>
                <th scope="col" className="w-20 pb-3 text-center font-bold">
                  Repsy
                </th>
                <th
                  scope="col"
                  className="w-24 pb-3 text-center text-[0.7rem] font-bold uppercase tracking-wider"
                  style={{ color: "var(--mute)" }}
                >
                  Sheets + chat
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr
                  key={row}
                  className="border-b"
                  style={{ borderColor: "var(--line)" }}
                >
                  <th scope="row" className="py-3.5 font-medium">
                    {row}
                  </th>
                  <td className="text-center">
                    <span
                      data-pop
                      className="inline-grid h-7 w-9 place-items-center rounded-md"
                      style={{
                        background: "var(--teal)",
                        color: "var(--paper)",
                      }}
                    >
                      <Icon name="check" size={15} />
                      <span className="sr-only">Yes</span>
                    </span>
                  </td>
                  <td className="text-center" style={{ color: "var(--mute)" }}>
                    <Icon name="cross" size={15} className="inline" />
                    <span className="sr-only">No</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ======================================================================================
 * DONE: the dark beat - the week's wins scrolling past and a turning badge.
 * ==================================================================================== */

function Badge() {
  const label = "ALL CHECKED IN · ALL CHECKED IN · ";
  return (
    <div
      className="relative mx-auto mt-16 grid h-[300px] w-[300px] place-items-center md:h-[340px] md:w-[340px]"
      aria-hidden="true"
    >
      <svg viewBox="0 0 300 300" className="ln-spin absolute inset-0">
        <defs>
          <path
            id="ln-badge-circle"
            d="M 150,150 m -122,0 a 122,122 0 1,1 244,0 a 122,122 0 1,1 -244,0"
          />
        </defs>
        <circle
          cx="150"
          cy="150"
          r="146"
          fill="none"
          stroke="var(--orange)"
          strokeWidth="4"
        />
        <text
          style={{
            fontFamily: "var(--display)",
            fontWeight: 700,
            fontSize: 25,
            letterSpacing: "0.14em",
            fill: "var(--soft)",
          }}
        >
          <textPath href="#ln-badge-circle">{label}</textPath>
        </text>
      </svg>
      <div
        className="grid h-[150px] w-[150px] place-items-center rounded-full border-2 text-center md:h-[170px] md:w-[170px]"
        style={{ borderColor: "var(--orange)" }}
      >
        <div>
          <p className="ln-display text-[3rem] md:text-[3.4rem]">12/12</p>
          <p
            className="mt-1 text-[0.62rem] font-bold tracking-[0.2em]"
            style={{ color: "var(--soft)" }}
          >
            CLIENTS ON TRACK
          </p>
        </div>
      </div>
    </div>
  );
}

export function Done() {
  const feed = [...FEED, ...FEED];
  return (
    <section
      className="ln-dark overflow-hidden py-24 md:py-32"
      aria-labelledby="ln-done-title"
    >
      <div className="ln-wrap text-center">
        <p
          className="ln-hand text-[1.8rem]"
          style={{ color: "var(--soft)" }}
          aria-hidden="true"
        >
          the best part of Monday
        </p>
        <h2
          id="ln-done-title"
          data-rise
          className="ln-display mt-2 text-[clamp(3.4rem,10vw,8.5rem)]"
        >
          Trained. Tracked. <span className="ln-key">Done.</span>
        </h2>
      </div>
      <div className="mt-14 overflow-hidden" aria-hidden="true">
        <div className="ln-marquee">
          {feed.map(([t, s], i) => (
            <div key={i} className="ln-dark-chip">
              <span
                className="ln-avatar"
                style={{ background: "var(--teal)", color: "var(--paper)" }}
              >
                <Icon name="check" size={14} />
              </span>
              <span className="leading-tight">
                <span className="block text-[0.85rem] font-bold">{t}</span>
                <span
                  className="block text-[0.72rem]"
                  style={{ color: "var(--soft)" }}
                >
                  {s}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <Badge />
    </section>
  );
}

/* ======================================================================================
 * NOTEBOOK: the old way, scribbled over beat by beat, then the page turns into the app.
 * ==================================================================================== */

function Tangle() {
  // Five app tiles scattered on a 380 x 500 stage, dashed threads between them; the beats add a
  // missed-day badge and a cloud of numbers; "Enough." pulls everything into the centre.
  const pos = TANGLE.map((a) => ({ cx: a.x + 14, cy: a.y + 14 }));
  const threads = [
    [0, 4],
    [1, 4],
    [2, 4],
    [3, 4],
    [0, 1],
    [2, 3],
  ];
  return (
    <div className="relative mx-auto h-[500px] w-[min(380px,88vw)]">
      <svg
        viewBox="0 0 100 130"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {threads.map(([a, b]) => (
          <line
            key={`${a}${b}`}
            data-nb-thread
            x1={pos[a].cx}
            y1={pos[a].cy * 1.3}
            x2={pos[b].cx}
            y2={pos[b].cy * 1.3}
            stroke="var(--mute)"
            strokeWidth="0.5"
            strokeDasharray="1.5 1.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {TANGLE.map((a, i) => (
        <div
          key={a.name}
          data-nb-tile={i}
          className="absolute flex h-[108px] w-[108px] flex-col items-center justify-center gap-2 rounded-[22px]"
          style={{
            left: `${a.x}%`,
            top: `${a.y}%`,
            transform: `rotate(${a.r}deg)`,
            background: "var(--paper)",
            border: "1px solid var(--line)",
            boxShadow:
              "0 18px 40px -22px color-mix(in srgb, var(--ink) 40%, transparent)",
          }}
        >
          <span
            className="ln-icon h-12 w-12"
            style={{
              background: a.color,
              color: a.on,
              boxShadow:
                "inset 0 -3px 0 color-mix(in srgb, var(--ink) 25%, transparent)",
            }}
          >
            <Icon name={a.icon} size={24} />
          </span>
          <span className="text-[0.74rem] font-semibold">{a.name}</span>
          {i === 1 && (
            <span
              data-nb-layer="1"
              className="absolute -right-2 -top-2 grid h-7 min-w-7 place-items-center rounded-full px-2 text-[0.72rem] font-bold"
              style={{ background: "var(--orange)", color: "var(--ink)" }}
            >
              47
            </span>
          )}
          {i === 2 && (
            <span
              data-nb-layer="1"
              className="ln-hand absolute -bottom-9 left-1/2 w-max -translate-x-1/2 text-[1.25rem]"
              style={{ color: "var(--orange-deep)" }}
            >
              Thu: nothing?
            </span>
          )}
        </div>
      ))}
      {/* beat 3: the numbers that never agree */}
      <div data-nb-layer="2" className="pointer-events-none absolute inset-0">
        {[
          ["80.0", "12%", "76%"],
          ["82.5", "70%", "18%"],
          ["79.6 ??", "40%", "92%"],
          ["+2.5?", "6%", "40%"],
        ].map(([n, l, tp]) => (
          <span
            key={n}
            className="ln-mono absolute rounded-full px-2.5 py-1 text-[0.8rem] font-bold"
            style={{ left: l, top: tp, background: "var(--card)" }}
          >
            {n}
          </span>
        ))}
      </div>
      <p
        className="ln-hand absolute bottom-0 right-2 text-[1.5rem]"
        aria-hidden="true"
      >
        for every client
      </p>
    </div>
  );
}

function AppCard() {
  return (
    <div className="ln-white mx-auto w-[min(380px,88vw)] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[1.25rem] font-bold">Maya Patel</p>
          <p className="ln-who">Progress · 12 check-ins · Block 2</p>
        </div>
        <span
          className="ln-tag"
          style={{ background: "var(--orange)", color: "var(--ink)" }}
        >
          Repsy
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["67.6 kg", "-0.8 kg"],
          ["85%", "adherence"],
          ["11", "workouts"],
        ].map(([a, b]) => (
          <div
            key={b}
            className="rounded-xl p-2.5"
            style={{ background: "var(--bg)" }}
          >
            <p className="ln-display text-[1.15rem]">{a}</p>
            <p className="ln-who">{b}</p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 300 70" className="mt-3 w-full" aria-hidden="true">
        <path
          d="M5 50 C 40 46, 60 54, 95 40 S 150 30, 185 34 S 250 18, 295 14"
          fill="none"
          stroke="var(--teal)"
          strokeWidth="2.5"
        />
      </svg>
      <ul
        className="mt-2 divide-y text-[0.86rem]"
        style={{ borderColor: "var(--line)" }}
      >
        {[
          ["Squat 4 × 6 · 82.5 kg", "Done"],
          ["Bench 4 × 8 · 52.5 kg", "Done"],
          ["RDL 3 × 10 · 72.5 kg", "Active"],
        ].map(([a, b]) => (
          <li key={a} className="flex items-center justify-between py-2.5">
            <span className="ln-mono text-[12px]">{a}</span>
            <span
              className={
                "ln-tag " +
                (b === "Done" ? "ln-tag-nutrition" : "ln-tag-workout")
              }
            >
              {b}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OldWay() {
  // Without motion (phones, reduced motion, before GSAP loads) this is a still frame: the first
  // beat, then Repsy and the app card. The pinned, layered scene (the tangle of apps that gets
  // pulled into one place) exists only under `.ln-anim`,
  // which StudioLanding sets once motion has started (see landing-new.css "notebook scene").
  return (
    <section
      data-scene="notebook"
      aria-labelledby="ln-old-title"
      className="relative"
    >
      <div
        data-nb-pin
        className="ln-wrap grid min-h-[100svh] items-center gap-12 py-20 md:grid-cols-2"
      >
        <div className="ln-beats relative">
          <h2 id="ln-old-title" className="sr-only">
            The old way, and Repsy
          </h2>
          {BEATS.map((b, i) => (
            <div
              key={b.title}
              data-beat={i}
              className={i > 0 ? "ln-beat-mid" : ""}
            >
              <p className="ln-h2 text-[clamp(2.2rem,4.4vw,3.4rem)]">
                {b.title}
              </p>
              <p className="mt-3" style={{ color: "var(--mute)" }}>
                {b.body}
              </p>
            </div>
          ))}
          <div data-beat={BEATS.length} className="ln-beat-end mt-10">
            <span
              className="ln-tag"
              style={{ background: "var(--orange)", color: "var(--ink)" }}
            >
              Repsy
            </span>
            <p className="ln-display mt-3 text-[clamp(3.2rem,6vw,5rem)]">
              <span className="ln-key">Progress.</span>
            </p>
            <p
              className="mt-2 text-[1.15rem] font-semibold"
              style={{ color: "var(--mute)" }}
            >
              The same client. The maths done.
            </p>
            <ul className="mt-6 space-y-3 text-[0.9rem]">
              {[
                [
                  "Every check-in in one place",
                  "Weight, adherence and workouts, logged in seconds.",
                ],
                ["Charts draw themselves", "Trends per client, no formulas."],
                ["Stalls get flagged", "Needs attention shows who, and why."],
              ].map(([a, b]) => (
                <li key={a} className="flex gap-3">
                  <span
                    className="ln-avatar h-6 w-6"
                    style={{ background: "var(--teal)" }}
                  >
                    <Icon name="check" size={12} />
                  </span>
                  <span>
                    <b>{a}</b>
                    <span
                      className="block text-[0.8rem]"
                      style={{ color: "var(--mute)" }}
                    >
                      {b}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div
          className="ln-nb-stage relative flex justify-center"
          style={{ perspective: "1400px" }}
        >
          <div data-nb-book className="ln-nb-book" aria-hidden="true">
            <Tangle />
          </div>
          <div data-nb-app>
            <AppCard />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ======================================================================================
 * PRICING
 * ==================================================================================== */

export function Pricing() {
  return (
    <section
      id="pricing"
      className="ln-wrap scroll-mt-24 py-24 md:py-32"
      aria-labelledby="ln-pricing-title"
    >
      <h2 id="ln-pricing-title" data-rise className="ln-h2 text-center">
        Start <span className="ln-key">free</span> for 7 days.
        <br />
        <span className="ln-dim">Pick a plan when it fits.</span>
      </h2>
      <p
        data-rise
        className="mt-5 text-center text-[0.9rem]"
        style={{ color: "var(--mute)" }}
      >
        Every plan starts with a 7-day free trial. Prices in US dollars, per
        month.
      </p>
      <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <article
            key={p.name}
            data-rise
            data-testid="plan"
            aria-labelledby={`ln-plan-${p.name}`}
            className={
              "flex flex-col rounded-[22px] p-7 " +
              (p.dark ? "ln-dark" : "ln-white")
            }
          >
            <h3 id={`ln-plan-${p.name}`} className="text-[1.05rem] font-bold">
              {p.name}
            </h3>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="ln-display text-[3.6rem]">${p.price}</span>
              <span
                className="text-[0.85rem]"
                style={{ color: p.dark ? "var(--soft)" : "var(--mute)" }}
              >
                per month
              </span>
            </p>
            <p
              className="mt-1 text-[0.82rem]"
              style={{ color: p.dark ? "var(--soft)" : "var(--mute)" }}
            >
              {p.clients}
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-[0.88rem]">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Icon
                    name="check"
                    size={16}
                    className="ln-tick mt-0.5 flex-none"
                  />
                  {f}
                </li>
              ))}
            </ul>
            <a href="#get" className="ln-btn mt-8 w-full">
              Start free
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ======================================================================================
 * FAQ: a coaches' group chat. Tap a question; Repsy answers in the thread.
 * ==================================================================================== */

function Answer({ text }: { text: string }) {
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) return setTyping(false);
    const t = setTimeout(() => setTyping(false), 650);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex justify-end">
      <div className="ln-bubble ln-bubble-dark" role="status">
        <p className="text-[0.66rem] opacity-60">Repsy</p>
        {typing ? (
          <span className="inline-flex gap-1 py-1">
            <span className="sr-only">Repsy is typing</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{
                  background: "var(--paper)",
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

export function FaqChat() {
  const [open, setOpen] = useState<number[]>([]);
  const times = useMemo(
    () => FAQ_CHAT.map((_, i) => `9:${String(41 + i * 2).padStart(2, "0")}`),
    [],
  );
  return (
    <section
      id="faq"
      className="ln-wrap grid scroll-mt-24 gap-12 py-24 md:grid-cols-[0.8fr_1.2fr] md:py-32"
      aria-labelledby="ln-faq-title"
    >
      <div data-rise>
        <h2
          id="ln-faq-title"
          className="ln-h2 text-[clamp(2.6rem,5.4vw,4.2rem)]"
        >
          Questions
          <br />
          coaches <span className="ln-key">will</span>
          <br />
          <span className="ln-dim">ask.</span>
        </h2>
        <p
          className="mt-6 max-w-xs text-[0.92rem]"
          style={{ color: "var(--mute)" }}
        >
          Straight answers, before anyone has to ask twice. Tap a message.
        </p>
      </div>
      <div data-rise className="ln-white overflow-hidden">
        <div
          className="flex items-center gap-3 border-b px-5 py-3.5"
          style={{ borderColor: "var(--line)" }}
        >
          <span className="flex -space-x-2" aria-hidden="true">
            {["P", "D", "S"].map((l) => (
              <span
                key={l}
                className="ln-avatar h-7 w-7 ring-2"
                style={{ ["--tw-ring-color" as string]: "var(--paper)" }}
              >
                {l}
              </span>
            ))}
          </span>
          <div>
            <p className="text-[0.88rem] font-bold">Coaches' group</p>
            <p className="ln-who">Priya, Dev, Sam, Nisha, Kabir, Ana, Repsy</p>
          </div>
        </div>
        <div
          className="space-y-3 p-4 md:p-5"
          style={{ background: "var(--bg)" }}
        >
          <p
            className="mx-auto w-fit rounded-full px-3 py-1 text-[0.7rem] font-semibold"
            style={{ background: "var(--paper)" }}
          >
            Tap a question for the answer
          </p>
          {FAQ_CHAT.map((f, i) => {
            const isOpen = open.includes(i);
            return (
              <div key={f.q} className="space-y-2" data-testid="faq">
                <div className="flex items-end gap-2">
                  <span className="ln-avatar" aria-hidden="true">
                    {f.who[0]}
                  </span>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((o) =>
                        o.includes(i) ? o.filter((x) => x !== i) : [...o, i],
                      )
                    }
                    className="ln-bubble min-h-11 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <span className="ln-who block">{f.who}</span>
                    <span className="font-semibold">{f.q}</span>
                    <span
                      className="ml-2 text-[0.62rem]"
                      style={{ color: "var(--mute)" }}
                    >
                      {times[i]}
                    </span>
                  </button>
                </div>
                {isOpen && <Answer text={f.a} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ======================================================================================
 * GET: the sign-up panel. The form is the real lead form (POST /api/leads).
 * ==================================================================================== */

export function Get() {
  return (
    <section
      id="get"
      className="ln-wrap scroll-mt-24 py-12 md:py-16"
      aria-labelledby="ln-get-title"
    >
      <div
        data-rise
        className="ln-white grid gap-12 p-8 md:grid-cols-[1.3fr_0.7fr] md:p-14"
      >
        <div>
          <h2 id="ln-get-title" className="ln-h2 text-[clamp(2.4rem,5vw,4rem)]">
            Get <span className="ln-key">Repsy.</span>
            <br />
            <span className="ln-dim">Your clients just get a link.</span>
          </h2>
          <p
            className="mt-5 max-w-lg text-[0.95rem]"
            style={{ color: "var(--mute)" }}
          >
            You sign up. Each client gets an invite link, sets a password and
            sees their membership, upcoming sessions and streaks in the browser.
            Nothing to install, nothing to sync.
          </p>
          <div className="ln-form">
            <LeadForm />
          </div>
          <ul
            className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.8rem] font-medium"
            style={{ color: "var(--mute)" }}
          >
            {[
              "7-day free trial",
              "No card to start",
              "Export your data any time",
            ].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Icon name="check" size={14} className="ln-tick" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div
            className="w-full max-w-[280px] rounded-[22px] p-5"
            style={{ background: "var(--bg)" }}
            aria-hidden="true"
          >
            <div className="flex items-center gap-2">
              <span className="ln-icon">
                <Icon name="link" />
              </span>
              <p className="text-[0.82rem] font-bold">
                Invite link for maya@example.com
              </p>
            </div>
            <p
              className="ln-mono mt-4 break-all rounded-xl p-3 text-[11px]"
              style={{ background: "var(--paper)" }}
            >
              repsy-coach.onrender.com/client/set-password?token=…
            </p>
            <p className="ln-who mt-3">
              Works once, for 48 hours. Emailed to them, or copy it if email
              isn't set up.
            </p>
            <p
              className="mt-4 rounded-full py-2.5 text-center text-[0.8rem] font-bold"
              style={{
                background: "var(--orange)",
                color: "var(--ink)",
                boxShadow: "0 3px 0 var(--ink)",
              }}
            >
              Copy link
            </p>
          </div>
          <p className="ln-hand mt-4 text-[1.4rem]" aria-hidden="true">
            that's all they need
          </p>
        </div>
      </div>
    </section>
  );
}
