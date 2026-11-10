// Landing hero, design A1 "live sheet" (user asked for a more animated hero than the static
// clipboard). A coach's planning sheet on graph paper plays the real Repsy flow on a loop:
// the coach asks about a client -> the AI writes its reasoning -> the plan rows are written in
// -> a cursor taps Assign -> an "Assigned" stamp lands -> the page turns to the next client.
// Pure React + CSS (no 3D, no animation library), so it paints with the first render.
// Accessibility: the scene is one role="img" with a summary; a real Pause button stops it
// (WCAG 2.2.2); it pauses off-screen / in a hidden tab; reduced motion shows a still frame.
import { useEffect, useRef, useState } from "react";

type Plan = {
  client: string;
  initials: string;
  goal: string;
  question: string;
  why: string;
  title: string;
  rows: [string, string, string][];
};

// Sample clients from the landing demo. Rows use the Manual Planner's notation.
const PLANS: Plan[] = [
  {
    client: "Maya Patel",
    initials: "MP",
    goal: "Fat loss + strength",
    question: "What should Maya focus on this week?",
    why: "Adherence climbed from 72% to 86%, so she can handle one heavier day.",
    title: "Lower-body strength day",
    rows: [
      ["Back Squat", "4 × 6", "120s"],
      ["Romanian Deadlift", "3 × 8", "90s"],
      ["Walking Lunge", "3 × 10", "60s"],
    ],
  },
  {
    client: "Arjun Mehta",
    initials: "AM",
    goal: "Muscle gain · Beginner",
    question: "Arjun keeps missing Friday. Any ideas?",
    why: "He's a beginner on 4 days and Fridays slip, so 3 full-body days are easier to keep.",
    title: "3-day full-body plan",
    rows: [
      ["Goblet Squat", "3 × 10", "90s"],
      ["Push-up", "3 × 8", "60s"],
      ["Dumbbell Row", "3 × 10", "60s"],
    ],
  },
  {
    client: "Casey Jordan",
    initials: "CJ",
    goal: "Marathon prep · Advanced",
    question: "Long run is Sunday. What about strength?",
    why: "Keep strength short and early in the week, so her legs are fresh for Sunday.",
    title: "Runner strength day",
    rows: [
      ["Single-leg RDL", "3 × 8", "60s"],
      ["Step-up", "3 × 10", "60s"],
      ["Calf Raise", "3 × 15", "45s"],
    ],
  },
];

// Timeline (ms from the start of one client's page).
const Q_START = 400;
const Q_MS = 32; // per character typed
const THINK_MS = 900;
const WHY_MS = 15;
const ROW_GAP = 420;
const CURSOR_MS = 800;
const HOLD_MS = 2600;
const TURN_MS = 650;

function timeline(p: Plan) {
  const qEnd = Q_START + p.question.length * Q_MS;
  const whyStart = qEnd + THINK_MS;
  const rowsStart = whyStart + p.why.length * WHY_MS + 250;
  const cursorStart = rowsStart + p.rows.length * ROW_GAP + 300;
  const click = cursorStart + CURSOR_MS;
  const stamp = click + 250;
  const turn = stamp + HOLD_MS;
  return { qEnd, whyStart, rowsStart, cursorStart, click, stamp, turn, end: turn + TURN_MS };
}

const typed = (text: string, elapsed: number, start: number, perChar: number) =>
  text.slice(0, Math.max(0, Math.min(text.length, Math.floor((elapsed - start) / perChar))));

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Drives the loop: elapsed ms within the current client's page, and which client. */
function useLoop(running: boolean, resetKey: unknown) {
  const [state, setState] = useState({ index: 0, elapsed: 0 });
  const last = useRef<number | null>(null);
  // Start over from the first client when the reduced-motion setting flips.
  useEffect(() => {
    setState({ index: 0, elapsed: 0 });
  }, [resetKey]);
  useEffect(() => {
    if (!running) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current === null ? 0 : Math.min(100, now - last.current);
      last.current = now;
      setState((s) => {
        const end = timeline(PLANS[s.index]).end;
        const e = s.elapsed + dt;
        return e >= end ? { index: (s.index + 1) % PLANS.length, elapsed: 0 } : { index: s.index, elapsed: e };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return state;
}

function useVisible<T extends Element>() {
  const ref = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [tabVisible, setTabVisible] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const el = ref.current;
    const onVis = () => setTabVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVis);
    let io: IntersectionObserver | undefined;
    if (el && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0 });
      io.observe(el);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
    };
  }, []);
  return [ref, onScreen && tabVisible] as const;
}

/** Gentle tilt toward the pointer (fine pointers, motion allowed). */
function useTilt<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const reset = () => {
      el?.style.removeProperty("--tilt-x");
      el?.style.removeProperty("--tilt-y");
    };
    if (!el || !enabled || !window.matchMedia?.("(pointer: fine)").matches) {
      reset();
      return;
    }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const y = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      el.style.setProperty("--tilt-x", `${(-y * 6).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(x * 8).toFixed(2)}deg`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      reset();
    };
  }, [enabled]);
  return ref;
}

export function LiveSheetHero() {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [sceneRef, visible] = useVisible<HTMLDivElement>();
  const running = !reduced && !paused && visible;
  const tiltRef = useTilt<HTMLDivElement>(running);
  const loop = useLoop(running, reduced);

  // Reduced motion: a still, finished frame of the first client.
  const index = reduced ? 0 : loop.index;
  const plan = PLANS[index];
  const t = timeline(plan);
  const e = reduced ? t.turn - 1 : loop.elapsed;

  const question = typed(plan.question, e, Q_START, Q_MS);
  const thinking = e >= t.qEnd && e < t.whyStart;
  const why = typed(plan.why, e, t.whyStart, WHY_MS);
  const rowsShown = e < t.rowsStart ? 0 : Math.min(plan.rows.length, Math.floor((e - t.rowsStart) / ROW_GAP) + 1);
  const cursorIn = e >= t.cursorStart;
  const pressed = e >= t.click && e < t.click + 220;
  const stamped = e >= t.stamp;
  const turning = e >= t.turn;
  const step = turning ? "turn" : stamped ? "assigned" : cursorIn ? "assign" : rowsShown ? "plan" : e >= t.whyStart ? "reason" : thinking ? "think" : "ask";

  return (
    <section aria-labelledby="hero-title" className="a1-hero relative -mt-[72px] pt-[72px]" data-hero="live-sheet">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-5 pb-24 pt-10 md:px-8 lg:grid-cols-[1fr_460px] lg:pb-32 lg:pt-16 xl:grid-cols-[1fr_480px]">
        <div>
          <p className="a1-stamp">Reasoning included</p>
          <h1 id="hero-title" className="a1-display mt-7">
            Plans with the{" "}
            <span className="whitespace-nowrap">
              <em className="a1-underlined">
                why
                <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  <path d="M4 14 C 60 4, 120 4, 196 10" />
                </svg>
              </em>{" "}
              written in.
            </span>
          </h1>
          <p className="mt-8 max-w-[34ch] text-lg leading-relaxed md:text-xl" style={{ color: "rgba(26, 26, 26, 0.82)" }}>
            Repsy's AI drafts each client's next plan and writes down why. You read it, assign it,
            or change it by hand with sets, reps and rest.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
            <a href="/app" className="btn-primary a1-btn">
              Start free
            </a>
            <a href="#demo" className="a1-textlink">
              See it in action
            </a>
          </div>
        </div>

        <div ref={sceneRef} className="ls-wrap" data-paused={!running}>
          <div ref={tiltRef} className="ls-tilt">
            {/* Paper stack behind the live page. */}
            <div className="ls-back ls-back-2" aria-hidden="true" />
            <div className="ls-back ls-back-1" aria-hidden="true" />
            <div
              className="ls-page"
              role="img"
              aria-label={`Animated example of Repsy planning for sample clients. Now showing ${plan.client}: the coach asks "${plan.question}" The AI suggests a ${plan.title.toLowerCase()} (${plan.rows.map((r) => r[0]).join(", ")}). Why: ${plan.why} The coach assigns it.`}
              data-step={step}
              data-client={plan.client}
              data-turning={turning}
              key={index}
            >
              <span className="ls-clip" aria-hidden="true" />
              {/* Client index tabs along the top edge. */}
              <div className="ls-tabs">
                {PLANS.map((p, i) => (
                  <span key={p.client} className={i === index ? "ls-tab ls-tab-on" : "ls-tab"}>
                    {p.client.split(" ")[0]}
                  </span>
                ))}
              </div>
              <div className="ls-head">
                <span className="ls-avatar">{plan.initials}</span>
                <div>
                  <div className="a1-serif text-[26px] leading-none">{plan.client}</div>
                  <div className="a1-mono mt-1 text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "#6b6560" }}>
                    {plan.goal}
                  </div>
                </div>
              </div>

              <div className="ls-ask">
                {question.length > 0 && (
                  <span className="ls-ask-bubble">
                    {question}
                    {e < t.qEnd && <span className="ls-caret" />}
                  </span>
                )}
              </div>

              <div className="ls-note" data-show={e >= t.qEnd}>
                <p className="a1-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#92400e" }}>
                  AI suggestion · Workout
                </p>
                {thinking ? (
                  <p className="ls-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </p>
                ) : (
                  <p className="mt-1.5 min-h-[3.9em] text-[14.5px] leading-snug">
                    <b>{why.length ? plan.title + "." : ""}</b> {why.length ? "Why: " + why : ""}
                  </p>
                )}
              </div>

              <ol className="ls-rows">
                {plan.rows.map(([name, dose, rest], i) => (
                  <li key={name} data-shown={i < rowsShown}>
                    <span className="a1-mono ls-n">{i + 1}</span>
                    <span className="ls-name">{name}</span>
                    <span className="a1-mono ls-dose">
                      {dose} · {rest}
                    </span>
                    <span className="ls-ink" />
                  </li>
                ))}
              </ol>

              <div className="ls-foot">
                <span className="ls-assign" data-pressed={pressed} data-done={stamped}>
                  {stamped ? "Assigned ✓" : `Assign to ${plan.client.split(" ")[0]}`}
                </span>
                <svg className="ls-cursor" data-in={cursorIn} data-pressed={pressed} width="22" height="26" viewBox="0 0 26 30" aria-hidden="true">
                  <path d="M2 2l20 12-9 2-4 9z" fill="#141414" stroke="#ffffff" strokeWidth="2" />
                </svg>
              </div>

              <span className="ls-stamp" data-show={stamped} aria-hidden="true">
                Assigned
              </span>
            </div>
          </div>
          {!reduced && (
            <button type="button" className="ls-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? "Play animation" : "Pause animation"}
            </button>
          )}
          <span className="a1-hand ls-scribble" aria-hidden="true">
            the why, every time
          </span>
        </div>
      </div>
    </section>
  );
}
