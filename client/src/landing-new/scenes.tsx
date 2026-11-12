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
  RIBBON,
  ROAD,
  SHEET,
  STRIPS,
} from "./content";
import { Icon, PenArrow, Scribble } from "./icons";

const STRIP_COUNT = STRIPS.length;

/* ======================================================================================
 * HERO: a plan sheet that, on scroll, straightens up and tears into one strip per client,
 * each stamped DONE.
 * ==================================================================================== */

function SheetBody() {
  return (
    <div className="px-7 pb-9 pt-10 text-[13px] leading-[1.55]">
      <p className="text-center text-[22px] font-bold tracking-[0.18em]">{SHEET.title}</p>
      {SHEET.meta.map((m) => (
        <p key={m} className="text-center text-[11px] opacity-70">
          {m}
        </p>
      ))}
      <div className="my-4 border-t-2 border-dashed" style={{ borderColor: "var(--line)" }} />
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-[3px]">
        {SHEET.rows.map(([move, dose, rest]) => (
          <Row key={move} move={move} dose={dose} rest={rest} />
        ))}
      </div>
      <div className="my-4 border-t-2 border-dashed" style={{ borderColor: "var(--line)" }} />
      {SHEET.totals.map(([k, v]) => (
        <p key={k} className="flex justify-between text-[12px] opacity-70">
          <span>{k}</span>
          <span>{v}</span>
        </p>
      ))}
      <p className="mt-3 flex justify-between text-[17px] font-bold">
        <span>EXERCISES</span>
        <span>5</span>
      </p>
      <div className="my-4 border-t-2 border-dashed" style={{ borderColor: "var(--line)" }} />
      <p className="text-center text-[10.5px] tracking-[0.12em] opacity-70">{SHEET.why}</p>
    </div>
  );
}

function Row({ move, dose, rest }: { move: string; dose: string; rest: string }) {
  return (
    <>
      <span>{move}</span>
      <span className="text-right font-bold">{dose}</span>
      <span className="text-right opacity-60">{rest}</span>
    </>
  );
}

/** Deterministic tear jitter, so strip i's right edge matches strip i+1's left edge exactly. */
function tearEdge(edge: number): number[] {
  const out: number[] = [];
  for (let k = 0; k <= 24; k++) out.push(Math.sin(edge * 12.9898 + k * 78.233) * 43758.5453 % 1 * 1.6);
  return out;
}
function stripClip(i: number): string {
  const x0 = (i * 100) / STRIP_COUNT;
  const x1 = ((i + 1) * 100) / STRIP_COUNT;
  const pts: string[] = [`${x0}% 0%`, `${x1}% 0%`];
  if (i < STRIP_COUNT - 1) {
    const j = tearEdge(i + 1);
    for (let k = 1; k < 24; k++) pts.push(`${x1 + j[k]}% ${(k * 100) / 24}%`);
  }
  pts.push(`${x1}% 100%`, `${x0}% 100%`);
  if (i > 0) {
    const j = tearEdge(i);
    for (let k = 23; k > 0; k--) pts.push(`${x0 + j[k]}% ${(k * 100) / 24}%`);
  }
  return `polygon(${pts.join(",")})`;
}

export function Hero() {
  return (
    <section id="top" data-scene="hero" aria-labelledby="ln-hero-title" className="relative">
      <div data-hero-pin className="ln-wrap flex min-h-[100svh] flex-col justify-center gap-12 pb-24 pt-28 lg:flex-row lg:items-center lg:gap-6 lg:pb-10">
        <div data-hero-copy className="relative z-10 lg:w-[46%]">
          <h1 id="ln-hero-title" className="ln-display text-[clamp(3.6rem,8.4vw,7rem)]">
            <span className="sr-only">Repsy Coach: </span>
            Plan it.
            <br />
            Track it.
            <br />
            Coached.
          </h1>
          <p className="ln-lead mt-7 max-w-[30rem] lg:max-w-[22rem] xl:max-w-[30rem]">
            Write a workout once, with the reasoning attached, and reuse it for every client. Mark it Done
            as they train and the check-ins chart themselves. No spreadsheets. No chasing.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <a href="#get" className="ln-cta">
              <span className="ln-cta-dot">
                <Icon name="arrow" size={16} />
              </span>
              Start free
            </a>
            <a href="#how" className="ln-btn-ghost">
              See how it works
            </a>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[0.82rem] font-medium" style={{ color: "var(--mute)" }}>
            {["7-day free trial", "Clients install nothing", "AI suggests, you decide"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Icon name="check" size={14} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex justify-center lg:w-[54%]">
          <div data-sheet-stage className="relative w-[min(330px,82vw)] xl:w-[370px]" style={{ transform: "rotate(4deg)" }}>
            {/* One sheet drawn four times, each clipped to its strip: together they read as one page. */}
            {STRIPS.map((s, i) => (
              <div key={s.name} data-strip={i} className="absolute inset-0 first:relative" style={{ clipPath: stripClip(i) }}>
                <div className="ln-sheet" aria-hidden={i > 0 ? "true" : undefined}>
                  <SheetBody />
                </div>
              </div>
            ))}
            {STRIPS.map((s, i) => (
              <div
                key={s.name}
                data-strip-label={i}
                className="pointer-events-none absolute top-0 flex h-full flex-col items-center"
                style={{ left: `${(i * 100) / STRIP_COUNT}%`, width: `${100 / STRIP_COUNT}%` }}
                aria-hidden="true"
              >
                <span data-stamp className="ln-stamp mt-[42%] -rotate-12 opacity-0">
                  DONE
                </span>
                <span data-strip-chip className="absolute -bottom-16 flex flex-col items-center gap-1 opacity-0">
                  <span className="ln-chip">{s.name}</span>
                  <span className="ln-mono text-[12px] font-semibold">{s.note}</span>
                </span>
              </div>
            ))}
          </div>
          <p data-hero-note className="ln-hand absolute -right-[2%] top-[2%] hidden rotate-[8deg] text-[1.7rem] lg:block" aria-hidden="true">
            one template,
            <br />
            four clients
          </p>
          <p data-hero-note className="ln-hand absolute -bottom-12 left-[18%] hidden items-center gap-2 text-[1.55rem] lg:flex" aria-hidden="true">
            <PenArrow dir="up" className="-ml-2" />
            16 sets each, the why on top
          </p>
        </div>
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
      <svg viewBox="0 0 1440 260" className="ln-ribbon block h-auto w-[130%] max-w-none -translate-x-[11%]" preserveAspectRatio="xMidYMid meet">
        <path id="ln-ribbon-path" d="M -120 230 Q 720 -40 1560 230" fill="none" stroke="var(--ink)" strokeWidth="96" />
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
    <section id="why" className="ln-wrap scroll-mt-24 py-24 text-center md:py-32">
      <h2 data-rise className="ln-h2 mx-auto max-w-4xl">
        Sunday night. Twelve clients.
        <br />
        <span className="ln-dim">Now comes the spreadsheet.</span>
      </h2>
      <p data-rise className="ln-h2 relative mx-auto mt-12 inline-block">
        Let Repsy handle it.
        <Scribble className="absolute -bottom-5 left-1/2 w-[46%] -translate-x-1/3" />
      </p>
      <p data-rise className="mt-10 text-lg font-medium" style={{ color: "var(--mute)" }}>
        (so you never have to text: did you train today?)
      </p>
      <p data-rise className="ln-hand mt-20 inline-flex flex-col items-center text-[1.7rem]" aria-hidden="true">
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
    <div data-rise className="ln-card relative mx-auto max-w-[400px] px-8 pb-9 pt-12 text-center">
      <span className="ln-icon absolute -top-5 left-1/2 -translate-x-1/2 shadow-sm">
        <Icon name={f.icon} />
      </span>
      <h3 className="ln-cond text-[clamp(2rem,3.6vw,2.75rem)]">
        {f.title[0]}
        <br />
        {f.title[1]}
      </h3>
      <p className="mt-4 text-[0.9rem] leading-relaxed" style={{ color: "var(--mute)" }}>
        {f.body}
      </p>
    </div>
  );
}

function AiMock() {
  return (
    <div data-rise className="ln-white mx-auto w-full max-w-[360px] p-4 text-left">
      <div className="flex items-center gap-2 border-b pb-3" style={{ borderColor: "var(--line)" }}>
        <span className="ln-avatar">MP</span>
        <div>
          <p className="text-[0.85rem] font-bold">AI Coach</p>
          <p className="ln-who">Maya Patel · Strength · Intermediate</p>
        </div>
      </div>
      <p className="ln-bubble ln-bubble-dark ml-auto mt-3 w-fit">Make a push day for Maya</p>
      <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--bg)" }}>
        <p className="ln-mono text-[11px] font-bold tracking-wider">SUGGESTED · WORKOUT</p>
        <p className="mt-1 font-bold">Push day · Week 3</p>
        <p className="ln-mono mt-2 text-[12px] leading-relaxed">
          1. Bench Press 4 × 8 · Rest 90s
          <br />
          2. Overhead Press 3 × 10 · Rest 90s
        </p>
        <p className="mt-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: "var(--paper)" }}>
          <b>Why:</b> bench has stalled for 3 weeks, so more volume at RPE 7.
        </p>
        <span className="ln-chip mt-3">Assign</span>
      </div>
    </div>
  );
}

function DoseMock() {
  return (
    <div data-rise className="ln-white mx-auto w-full max-w-[330px] p-5">
      <div className="flex items-center justify-between">
        <p className="font-bold">Leg day</p>
        <span className="ln-tag ln-tag-light">Workout</span>
      </div>
      <div className="ln-mono mt-4 space-y-2 text-[12.5px]">
        {[
          ["1. Back Squat", "4 sets × 6 reps", "Rest 120s"],
          ["2. Romanian Deadlift", "3 sets × 10 reps", "Rest 90s"],
          ["3. Walking Lunge", "3 sets × 12 reps", "Rest 60s"],
        ].map(([a, b, c]) => (
          <div key={a} className="rounded-xl px-3 py-2" style={{ background: "var(--bg)" }}>
            <p className="font-bold">{a}</p>
            <p style={{ color: "var(--mute)" }}>
              {b} · {c}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-[11px]" style={{ color: "var(--mute)" }}>
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
          <div key={a} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: i === 0 ? "var(--bg)" : undefined }}>
            <span className="ln-avatar">
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
        <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--dark-3)" }}>
          <div data-fill className="h-full rounded-full" style={{ width: "75%", background: "var(--paper)" }} />
        </div>
      </div>
    </div>
  );
}

function CheckinMock() {
  return (
    <div data-rise className="ln-white relative mx-auto w-full max-w-[340px] overflow-hidden p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-bold">Arjun · weight</p>
        <p className="ln-mono text-[12px]">82.4 → 80.9 kg</p>
      </div>
      <svg viewBox="0 0 300 110" className="mt-3 w-full" aria-hidden="true">
        {[22, 55, 88].map((y) => (
          <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 5" />
        ))}
        <path data-draw d="M5 30 C 40 34, 60 26, 90 44 S 150 52, 180 62 S 240 70, 295 84" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        {[
          [5, 30],
          [90, 44],
          [180, 62],
          [295, 84],
        ].map(([x, y]) => (
          <circle key={x} cx={x} cy={y} r="4.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.5" />
        ))}
      </svg>
      <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: "var(--bg)" }}>
        <Icon name="bell" size={15} />
        <span>
          <b>Needs attention:</b> Leo · adherence 58% over 2 weeks
        </span>
      </div>
      {/* the scan line that sweeps the chart (motion.ts moves it) */}
      <div data-scan className="pointer-events-none absolute inset-x-0 top-14 h-[2px]" style={{ background: "var(--ink)", boxShadow: "0 0 18px 6px var(--card)" }} />
    </div>
  );
}

const MOCKS = { ai: AiMock, dose: DoseMock, live: LiveMock, checkins: CheckinMock } as const;

export function Road() {
  const sectionRef = useRef<HTMLElement>(null);
  const [geom, setGeom] = useState<{ w: number; h: number; d: string } | null>(null);

  // The road is drawn from the real layout: one bend per feature row, so it always meets the cards.
  useLayoutEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const build = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const rows = [...el.querySelectorAll<HTMLElement>("[data-road-row]")].map((r) => r.offsetTop + r.offsetHeight / 2);
      const left = w * 0.12;
      const right = w * 0.88;
      let d = `M ${w * 0.5} 0 C ${w * 0.5} ${rows[0] * 0.4}, ${right} ${rows[0] * 0.5}, ${right} ${rows[0]}`;
      rows.forEach((y, i) => {
        const next = rows[i + 1] ?? h;
        const from = i % 2 === 0 ? right : left;
        const to = i % 2 === 0 ? left : right;
        const mid = (y + next) / 2;
        d += ` C ${from} ${mid}, ${to} ${mid}, ${to} ${next === h ? h - 40 : next}`;
      });
      setGeom({ w, h, d });
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section id="how" ref={sectionRef} data-scene="road" aria-labelledby="ln-how-title" className="relative scroll-mt-24 pb-24">
      {geom && (
        <svg className="ln-road pointer-events-none absolute inset-0 hidden md:block" width={geom.w} height={geom.h} viewBox={`0 0 ${geom.w} ${geom.h}`} aria-hidden="true">
          <path data-road d={geom.d} pathLength={1000} strokeWidth="46" />
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
            <div key={f.id} data-road-row className="grid items-center gap-14 md:grid-cols-2 md:gap-10">
              <div className={flip ? "md:order-2" : ""}>
                <FeatureCard f={f} />
                <p className={"ln-hand mt-6 flex items-center gap-2 text-[1.6rem] " + (flip ? "justify-start md:pl-10" : "justify-end md:pr-10")} aria-hidden="true">
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
 * CURRENCY: the one real setting that changes how the whole Business tab reads.
 * ==================================================================================== */

const MONEY = {
  // Paid = Maya + Arjun; due = all four (Casey is on a quarterly plan).
  INR: { sym: "₹", plan: "4,999", total: "9,998", of: "26,997", q: "12,000", pct: "37%" },
  USD: { sym: "$", plan: "59", total: "118", of: "326", q: "149", pct: "36%" },
} as const;

export function Currency() {
  const [cur, setCur] = useState<keyof typeof MONEY>("INR");
  const m = MONEY[cur];
  const rows: [string, string, string][] = [
    ["Maya", `${m.sym}${m.plan}`, "Paid"],
    ["Arjun", `${m.sym}${m.plan}`, "Paid"],
    ["Casey", `${m.sym}${m.q}`, "Due in 2 days"],
    ["Leo", `${m.sym}${m.plan}`, "3 days overdue"],
  ];
  return (
    <section className="ln-wrap grid items-center gap-16 py-24 md:grid-cols-2 md:py-32">
      <div data-rise>
        <h2 className="ln-h2">
          Prices, just the
          <br />
          way you bill.
        </h2>
        <p className="ln-h2 mt-8 text-[clamp(1.6rem,3vw,2.2rem)]" style={{ color: "var(--mute-2)" }}>
          Rupees or dollars?
        </p>
        <div className="mt-6 flex items-center gap-4">
          <div className="ln-toggle" role="group" aria-label="Currency">
            {(["INR", "USD"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={cur === c} onClick={() => setCur(c)}>
                {c === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>
          <span className="ln-hand flex items-center gap-2 text-[1.5rem]" aria-hidden="true">
            <PenArrow dir="left" />
            go on, tap it
          </span>
        </div>
        <p className="mt-6 max-w-sm text-[0.9rem]" style={{ color: "var(--mute)" }}>
          Set your currency once on the Account page. Plan prices and the payments you record show in it
          everywhere. Repsy keeps the record; it never charges anyone.
        </p>
      </div>
      <div data-rise className="flex justify-center">
        <div className="ln-phone">
          <span className="ln-notch" aria-hidden="true" />
          <p className="sr-only" aria-live="polite">
            Showing amounts in {cur}
          </p>
          <div className="ln-phone-screen px-5 pb-6 pt-14">
            <p className="text-[1.2rem] font-bold">Business</p>
            <p className="ln-who">Monthly coaching · November</p>
            <div className="mt-4 rounded-2xl p-4" style={{ background: "var(--bg)" }}>
              <div className="flex items-baseline justify-between">
                <p className="ln-display text-[2rem]">
                  {m.sym}
                  {m.total}
                </p>
                <p className="ln-who">
                  of {m.sym}
                  {m.of}
                </p>
              </div>
              <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--line)" }}>
                <div className="h-full rounded-full" style={{ width: m.pct, background: "var(--ink)" }} />
              </div>
              <p className="ln-who mt-2">2 of 4 paid</p>
            </div>
            <ul className="mt-4 space-y-3">
              {rows.map(([n, amt, st]) => (
                <li key={n} className="flex items-center gap-3">
                  <span className="ln-avatar">{n[0]}</span>
                  <span className="flex-1 text-[0.9rem] font-semibold">{n}</span>
                  <span className="text-right">
                    <span className="ln-mono block text-[0.82rem] font-bold">{amt}</span>
                    <span className={"ln-tag mt-0.5 " + (st === "Paid" ? "ln-tag-dark" : "ln-tag-light")}>{st}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-full py-3 text-center text-[0.85rem] font-bold" style={{ background: "var(--ink)", color: "var(--paper)" }}>
              Record payment
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

export function More() {
  return (
    <section className="ln-wrap py-24 md:py-28">
      <h2 data-rise className="ln-h2 text-center">
        It does more than plan.
        <br />
        <span className="ln-dim">The bits you find later.</span>
      </h2>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MORE.map((m) => (
          <article key={m.title} data-rise className="ln-white p-6">
            <div className="flex items-center justify-between">
              <span className="ln-icon" style={{ background: "var(--bg)" }}>
                <Icon name={m.icon} />
              </span>
              <span className="ln-tag ln-tag-light">{m.tag}</span>
            </div>
            <h3 className="mt-6 text-[1.05rem] font-bold">{m.title}</h3>
            <p className="mt-2 text-[0.88rem] leading-relaxed" style={{ color: "var(--mute)" }}>
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
      <div data-rise className="ln-white grid overflow-hidden md:grid-cols-[0.85fr_1.15fr]">
        <div className="relative min-h-[420px] overflow-hidden p-6" style={{ background: "var(--bg)" }}>
          <svg className="ln-road pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 520" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 260 -20 C 330 120, 60 160, 120 290 S 330 420, 230 560" strokeWidth="38" />
          </svg>
          <div className="relative">
            <div className="flex items-center justify-between rounded-full px-4 py-2" style={{ background: "var(--paper)" }}>
              <span className="text-[0.82rem] font-bold">Clients</span>
              <span className="ln-tag ln-tag-dark">47 unread</span>
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              {CHAOS.map((c, i) => (
                <div key={i} data-pop className={"ln-bubble " + (c.right ? "ml-auto" : "")}>
                  <p className="ln-who">{c.who}</p>
                  {c.text}
                </div>
              ))}
            </div>
            <p className="ln-hand mt-8 text-right text-[1.7rem]" aria-hidden="true">
              sound familiar?
            </p>
          </div>
        </div>
        <div className="p-7 md:p-12">
          <h2 className="ln-h2 text-[clamp(2rem,3.8vw,2.9rem)]">
            <span className="ln-dim">More than a group chat.</span>
            <br />
            See the difference.
          </h2>
          <table className="mt-10 w-full text-left text-[0.88rem]">
            <thead>
              <tr className="border-b-2" style={{ borderColor: "var(--ink)" }}>
                <th scope="col" className="pb-3 text-[0.7rem] font-bold uppercase tracking-wider" style={{ color: "var(--mute)" }}>
                  What you get
                </th>
                <th scope="col" className="w-20 pb-3 text-center font-bold">
                  Repsy
                </th>
                <th scope="col" className="w-24 pb-3 text-center text-[0.7rem] font-bold uppercase tracking-wider" style={{ color: "var(--mute)" }}>
                  Sheets + chat
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row} className="border-b" style={{ borderColor: "var(--line)" }}>
                  <th scope="row" className="py-3.5 font-medium">
                    {row}
                  </th>
                  <td className="text-center">
                    <span data-pop className="inline-grid h-7 w-9 place-items-center rounded-md" style={{ background: "var(--ink)", color: "var(--paper)" }}>
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
    <div className="relative mx-auto mt-16 grid h-[300px] w-[300px] place-items-center md:h-[340px] md:w-[340px]" aria-hidden="true">
      <svg viewBox="0 0 300 300" className="ln-spin absolute inset-0">
        <defs>
          <path id="ln-badge-circle" d="M 150,150 m -122,0 a 122,122 0 1,1 244,0 a 122,122 0 1,1 -244,0" />
        </defs>
        <circle cx="150" cy="150" r="146" fill="none" stroke="var(--dark-3)" strokeWidth="4" />
        <text style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 25, letterSpacing: "0.14em", fill: "var(--soft)" }}>
          <textPath href="#ln-badge-circle">{label}</textPath>
        </text>
      </svg>
      <div className="grid h-[150px] w-[150px] place-items-center rounded-full border-2 text-center md:h-[170px] md:w-[170px]" style={{ borderColor: "var(--paper)" }}>
        <div>
          <p className="ln-display text-[3rem] md:text-[3.4rem]">12/12</p>
          <p className="mt-1 text-[0.62rem] font-bold tracking-[0.2em]" style={{ color: "var(--soft)" }}>
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
    <section className="ln-dark overflow-hidden py-24 md:py-32" aria-labelledby="ln-done-title">
      <div className="ln-wrap text-center">
        <p className="ln-hand text-[1.8rem]" style={{ color: "var(--soft)" }} aria-hidden="true">
          the best part of Monday
        </p>
        <h2 id="ln-done-title" data-rise className="ln-display mt-2 text-[clamp(3.4rem,10vw,8.5rem)]">
          Trained. Tracked. Done.
        </h2>
      </div>
      <div className="mt-14 overflow-hidden" aria-hidden="true">
        <div className="ln-marquee">
          {feed.map(([t, s], i) => (
            <div key={i} className="ln-dark-chip">
              <span className="ln-avatar" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                <Icon name="check" size={14} />
              </span>
              <span className="leading-tight">
                <span className="block text-[0.85rem] font-bold">{t}</span>
                <span className="block text-[0.72rem]" style={{ color: "var(--soft)" }}>
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

function Notebook() {
  return (
    <div className="ln-notebook relative mx-auto h-[500px] w-[min(380px,88vw)] overflow-hidden px-6 pb-6 pl-[62px] pt-7 text-[1.45rem] leading-[32px]">
      <span className="ln-ring" aria-hidden="true" />
      <p className="relative mb-[10px] inline-block text-[1.9rem]">
        Maya - Block 2
        <svg viewBox="0 0 200 8" className="absolute -bottom-0.5 left-0 w-full" aria-hidden="true">
          <path d="M2 5 C 60 1, 140 1, 198 5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </p>
      {[
        ["Squat 4×6", "80 kg"],
        ["Bench 4×8", "50 kg"],
        ["RDL 3×10", "70 kg"],
      ].map(([a, b]) => (
        <p key={a} className="flex justify-between">
          <span>{a}</span>
          <span>{b}</span>
        </p>
      ))}
      <p className="relative flex justify-between">
        <span>Wk 1 ✓ Wk 2 ✓</span>
        <span data-nb-layer="1">
          Wk 3 ?
        </span>
      </p>
      {/* Beat 2: Thursday went missing */}
      <div data-nb-layer="1">
        <p className="relative">
          + Thu - ??
          <span className="absolute -left-[58px] top-1 text-[1rem]">missed!</span>
        </p>
      </div>
      {/* Beat 3: the maths that never quite works */}
      <div data-nb-layer="2">
        <p className="mt-2">80 → 82.5 → 80 ??</p>
        <p>
          stall? deload?{" "}
          <span className="inline-block rounded-[50%] border-2 border-current px-2 leading-[28px]">+2.5?</span>
        </p>
      </div>
      {/* Beat 4: enough */}
      <svg data-nb-x viewBox="0 0 380 500" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <path data-strike d="M 40 40 L 345 470" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        <path data-strike d="M 340 60 L 70 460" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>
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
        <span className="ln-tag ln-tag-dark">Repsy</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["67.6 kg", "-0.8 kg"],
          ["85%", "adherence"],
          ["11", "workouts"],
        ].map(([a, b]) => (
          <div key={b} className="rounded-xl p-2.5" style={{ background: "var(--bg)" }}>
            <p className="ln-display text-[1.15rem]">{a}</p>
            <p className="ln-who">{b}</p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 300 70" className="mt-3 w-full" aria-hidden="true">
        <path d="M5 50 C 40 46, 60 54, 95 40 S 150 30, 185 34 S 250 18, 295 14" fill="none" stroke="var(--ink)" strokeWidth="2.5" />
      </svg>
      <ul className="mt-2 divide-y text-[0.86rem]" style={{ borderColor: "var(--line)" }}>
        {[
          ["Squat 4 × 6 · 82.5 kg", "Done"],
          ["Bench 4 × 8 · 52.5 kg", "Done"],
          ["RDL 3 × 10 · 72.5 kg", "Active"],
        ].map(([a, b]) => (
          <li key={a} className="flex items-center justify-between py-2.5">
            <span className="ln-mono text-[12px]">{a}</span>
            <span className={"ln-tag " + (b === "Done" ? "ln-tag-dark" : "ln-tag-light")}>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OldWay() {
  // Without motion (phones, reduced motion, before GSAP loads) this is a still frame: the first
  // beat, then Repsy and the app card. The pinned, layered scene exists only under `.ln-anim`,
  // which StudioLanding sets once motion has started (see landing-new.css "notebook scene").
  return (
    <section data-scene="notebook" aria-labelledby="ln-old-title" className="relative">
      <div data-nb-pin className="ln-wrap grid min-h-[100svh] items-center gap-12 py-20 md:grid-cols-2">
        <div className="ln-beats relative">
          <h2 id="ln-old-title" className="sr-only">
            The old way, and Repsy
          </h2>
          {BEATS.map((b, i) => (
            <div key={b.title} data-beat={i} className={i > 0 ? "ln-beat-mid" : ""}>
              <p className="ln-h2 text-[clamp(2.2rem,4.4vw,3.4rem)]">{b.title}</p>
              <p className="mt-3" style={{ color: "var(--mute)" }}>
                {b.body}
              </p>
            </div>
          ))}
          <div data-beat={BEATS.length} className="ln-beat-end mt-10">
            <span className="ln-tag ln-tag-dark">Repsy</span>
            <p className="ln-display mt-3 text-[clamp(3.2rem,6vw,5rem)]">Progress.</p>
            <p className="mt-2 text-[1.15rem] font-semibold" style={{ color: "var(--mute)" }}>
              The same client. The maths done.
            </p>
            <ul className="mt-6 space-y-3 text-[0.9rem]">
              {[
                ["Every check-in in one place", "Weight, adherence and workouts, logged in seconds."],
                ["Charts draw themselves", "Trends per client, no formulas."],
                ["Stalls get flagged", "Needs attention shows who, and why."],
              ].map(([a, b]) => (
                <li key={a} className="flex gap-3">
                  <span className="ln-avatar h-6 w-6">
                    <Icon name="check" size={12} />
                  </span>
                  <span>
                    <b>{a}</b>
                    <span className="block text-[0.8rem]" style={{ color: "var(--mute)" }}>
                      {b}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="ln-nb-stage relative flex justify-center" style={{ perspective: "1400px" }}>
          <div data-nb-book className="ln-nb-book" aria-hidden="true">
            <Notebook />
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
    <section id="pricing" className="ln-wrap scroll-mt-24 py-24 md:py-32" aria-labelledby="ln-pricing-title">
      <h2 id="ln-pricing-title" data-rise className="ln-h2 text-center">
        Start free for 7 days.
        <br />
        <span className="ln-dim">Pick a plan when it fits.</span>
      </h2>
      <p data-rise className="mt-5 text-center text-[0.9rem]" style={{ color: "var(--mute)" }}>
        Every plan starts with a 7-day free trial. Prices in US dollars, per month.
      </p>
      <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <article
            key={p.name}
            data-rise
            data-testid="plan"
            aria-labelledby={`ln-plan-${p.name}`}
            className={"flex flex-col rounded-[22px] p-7 " + (p.dark ? "ln-dark" : "ln-white")}
          >
            <h3 id={`ln-plan-${p.name}`} className="text-[1.05rem] font-bold">
              {p.name}
            </h3>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="ln-display text-[3.6rem]">${p.price}</span>
              <span className="text-[0.85rem]" style={{ color: p.dark ? "var(--soft)" : "var(--mute)" }}>
                per month
              </span>
            </p>
            <p className="mt-1 text-[0.82rem]" style={{ color: p.dark ? "var(--soft)" : "var(--mute)" }}>
              {p.clients}
            </p>
            <ul className="mt-6 flex-1 space-y-2.5 text-[0.88rem]">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Icon name="check" size={16} className="mt-0.5 flex-none" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="#get"
              className="mt-8 flex min-h-12 items-center justify-center rounded-full text-[0.9rem] font-bold"
              style={p.dark ? { background: "var(--paper)", color: "var(--ink)" } : { background: "var(--ink)", color: "var(--paper)" }}
            >
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
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
              <span key={i} aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--paper)", animationDelay: `${i * 150}ms` }} />
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
  const times = useMemo(() => FAQ_CHAT.map((_, i) => `9:${String(41 + i * 2).padStart(2, "0")}`), []);
  return (
    <section id="faq" className="ln-wrap grid scroll-mt-24 gap-12 py-24 md:grid-cols-[0.8fr_1.2fr] md:py-32" aria-labelledby="ln-faq-title">
      <div data-rise>
        <h2 id="ln-faq-title" className="ln-h2 text-[clamp(2.6rem,5.4vw,4.2rem)]">
          Questions
          <br />
          coaches <span className="ln-dim">will</span>
          <br />
          <span className="ln-dim">ask.</span>
        </h2>
        <p className="mt-6 max-w-xs text-[0.92rem]" style={{ color: "var(--mute)" }}>
          Straight answers, before anyone has to ask twice. Tap a message.
        </p>
      </div>
      <div data-rise className="ln-white overflow-hidden">
        <div className="flex items-center gap-3 border-b px-5 py-3.5" style={{ borderColor: "var(--line)" }}>
          <span className="flex -space-x-2" aria-hidden="true">
            {["P", "D", "S"].map((l) => (
              <span key={l} className="ln-avatar h-7 w-7 ring-2" style={{ ["--tw-ring-color" as string]: "var(--paper)" }}>
                {l}
              </span>
            ))}
          </span>
          <div>
            <p className="text-[0.88rem] font-bold">Coaches' group</p>
            <p className="ln-who">Priya, Dev, Sam, Nisha, Kabir, Ana, Repsy</p>
          </div>
        </div>
        <div className="space-y-3 p-4 md:p-5" style={{ background: "var(--bg)" }}>
          <p className="mx-auto w-fit rounded-full px-3 py-1 text-[0.7rem] font-semibold" style={{ background: "var(--paper)" }}>
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
                    onClick={() => setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]))}
                    className="ln-bubble min-h-11 text-left transition-transform hover:-translate-y-0.5"
                  >
                    <span className="ln-who block">{f.who}</span>
                    <span className="font-semibold">{f.q}</span>
                    <span className="ml-2 text-[0.62rem]" style={{ color: "var(--mute)" }}>
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
    <section id="get" className="ln-wrap scroll-mt-24 py-12 md:py-16" aria-labelledby="ln-get-title">
      <div data-rise className="ln-white grid gap-12 p-8 md:grid-cols-[1.3fr_0.7fr] md:p-14">
        <div>
          <h2 id="ln-get-title" className="ln-h2 text-[clamp(2.4rem,5vw,4rem)]">
            Get Repsy.
            <br />
            <span className="ln-dim">Your clients just get a link.</span>
          </h2>
          <p className="mt-5 max-w-lg text-[0.95rem]" style={{ color: "var(--mute)" }}>
            You sign up. Each client gets an invite link, sets a password and sees their membership,
            upcoming sessions and streaks in the browser. Nothing to install, nothing to sync.
          </p>
          <div className="ln-form">
            <LeadForm />
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.8rem] font-medium" style={{ color: "var(--mute)" }}>
            {["7-day free trial", "No card to start", "Export your data any time"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Icon name="check" size={14} />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div className="w-full max-w-[280px] rounded-[22px] p-5" style={{ background: "var(--bg)" }} aria-hidden="true">
            <div className="flex items-center gap-2">
              <span className="ln-icon">
                <Icon name="link" />
              </span>
              <p className="text-[0.82rem] font-bold">Invite link for maya@example.com</p>
            </div>
            <p className="ln-mono mt-4 break-all rounded-xl p-3 text-[11px]" style={{ background: "var(--paper)" }}>
              repsy-coach.onrender.com/client/set-password?token=…
            </p>
            <p className="ln-who mt-3">Works once, for 48 hours. Emailed to them, or copy it if email isn't set up.</p>
            <p className="mt-4 rounded-full py-2.5 text-center text-[0.8rem] font-bold" style={{ background: "var(--ink)", color: "var(--paper)" }}>
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
