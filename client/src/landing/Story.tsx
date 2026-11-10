// Feature story below the hero (Prompt 39): problem strip, AI Coach, Manual Planner, Progress.
// Copy is tied to shipped v1 features only. The mocks are built in HTML / CSS / SVG from the
// app's design - no screenshots. Animations live in useStoryAnimations (GSAP, landing only).
// This file is its own lazy chunk, so GSAP never delays the hero.
import { useRef } from "react";
import { useStoryAnimations } from "./useStoryAnimations";

const PAINS = [
  {
    title: "Planning eats your evenings",
    body: "Writing a fresh plan for every client, every week, takes hours you could spend coaching.",
  },
  {
    title: "Plans lose their why",
    body: "A plan with no reasoning is hard to explain to a client and hard to adjust later.",
  },
  {
    title: "Progress is scattered",
    body: "Weights, check-ins and notes spread across chats and spreadsheets hide the trend.",
  },
];

const CHAT = [
  { from: "coach", text: "What should Maya focus on this week?" },
  {
    from: "ai",
    text: "Maya's goal is fat loss + strength and her adherence is climbing. Keep 4 sessions, add one lower-body strength day and keep protein high.",
  },
];

const ROWS: [string, number, number, number][] = [
  ["Back Squat", 4, 6, 120],
  ["Romanian Deadlift", 3, 8, 90],
  ["Bench Press", 4, 6, 120],
  ["Barbell Row", 3, 10, 60],
];

// Sample data: Sarah Mitchell from the 6-month demo (82 kg -> 74.1 kg over 26 weeks).
const WEIGHT = Array.from({ length: 26 }, (_, i) => 82 - (7.9 * i) / 25 + (i % 3 === 1 ? 0.25 : i % 3 === 2 ? -0.15 : 0));
WEIGHT[25] = 74.1;
const ADHERENCE = Array.from({ length: 26 }, (_, i) => 80 + Math.round(Math.sin(i * 0.9) * 6) + Math.round(i / 6));

function linePoints(values: number[], min: number, max: number, w = 300, h = 110) {
  return values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / (max - min)) * h).toFixed(1)}`)
    .join(" ");
}

function TryLink() {
  return (
    <a href="/app" className="l-link mt-8 inline-flex min-h-10 items-center text-sm font-bold uppercase tracking-wider underline decoration-2 underline-offset-[6px]">
      Try it in the app
    </a>
  );
}

function Kicker({ n, label }: { n: string; label: string }) {
  return (
    <p className="l-kicker">
      {n} — {label}
    </p>
  );
}

export default function Story() {
  const root = useRef<HTMLDivElement>(null);
  useStoryAnimations(root);

  return (
    <div ref={root} id="features" className="landing-cream scroll-mt-16 overflow-x-clip">
      {/* 1. Problem strip: numbered, ruled columns - no cards. */}
      <section aria-labelledby="problem-title" className="landing-cream py-20 md:py-28" data-story="problem">
        <div className="mx-auto max-w-[1100px] px-4">
          <Kicker n="01" label="The problem" />
          <h2 id="problem-title" className="l-h2 mt-3 max-w-3xl">
            Coaching is the job. Admin isn't.
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {PAINS.map((p, i) => (
              <article key={p.title} className="l-rule pt-5" data-anim="pain">
                <p className="l-num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-4 text-2xl">{p.title}</h3>
                <p className="landing-dim mt-2">{p.body}</p>
              </article>
            ))}
          </div>
          <TryLink />
        </div>
      </section>

      {/* 2. AI Coach */}
      <section aria-labelledby="ai-title" className="landing-cream py-20 md:py-28" data-story="ai">
        <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-4 md:grid-cols-2">
          <div>
            <Kicker n="02" label="AI Coach" />
            <h2 id="ai-title" className="l-h2 mt-3">
              AI Coach, with the reasoning shown
            </h2>
            <p className="landing-dim mt-4 text-lg">
              Ask about any client. The answer uses their goal, level, recent plans and check-ins,
              and a suggested plan comes with the reason behind it. Nothing is saved until you tap
              Assign.
            </p>
            <TryLink />
          </div>
          <div className="[perspective:1000px]">
            <div data-anim="mock" className="landing-card overflow-hidden shadow-lg" aria-label="AI Coach example" role="img">
              <div className="landing-dark flex items-center gap-2 px-4 py-2">
                <img src="/favicon.png" alt="" width={20} height={20} className="h-5 w-5" />
                <span className="text-xs text-white/80">AI Coach · Maya Patel</span>
              </div>
              <div className="flex flex-col gap-3 p-4" style={{ background: "#faf7f2" }}>
                {CHAT.map((m, i) =>
                  m.from === "coach" ? (
                    <p key={i} data-anim="bubble" data-full={m.text} className="ml-auto max-w-[80%] rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: "#ff4a1f", color: "#141414" }}>
                      {m.text}
                    </p>
                  ) : (
                    <p key={i} data-anim="bubble" data-full={m.text} className="landing-card max-w-[85%] px-3 py-2 text-sm">
                      {m.text}
                    </p>
                  ),
                )}
                <div data-anim="suggestion" className="landing-card p-3">
                  <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "#ff4a1f", color: "#141414" }}>
                    Workout
                  </span>
                  <p className="mt-2 text-sm font-bold">Lower-body strength day</p>
                  <p className="landing-dim mt-1 text-xs">Why: supports her strength goal while adherence is high.</p>
                  <span className="mt-2 inline-block rounded-lg px-3 py-1 text-xs font-bold" style={{ background: "#ff4a1f", color: "#141414" }}>
                    Assign to client
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Manual Planner */}
      <section aria-labelledby="planner-title" className="landing-cream py-20 md:py-28" data-story="planner">
        <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-4 md:grid-cols-2">
          <div className="md:order-2">
            <Kicker n="03" label="Manual Planner" />
            <h2 id="planner-title" className="l-h2 mt-3">
              Plan by hand when you want to
            </h2>
            <p className="landing-dim mt-4 text-lg">
              Search the exercise library, set sets, reps and rest for each exercise, and save it
              as one clear numbered workout. Mark plans Active, Done or Paused.
            </p>
            <TryLink />
          </div>
          <ol className="landing-card flex flex-col gap-2 p-4" aria-label="Example workout">
            {ROWS.map(([name, sets, reps, rest], i) => (
              <li key={name} data-anim="row" className="rounded-lg px-3 py-2 text-sm" style={{ background: "#f1ede6" }}>
                <span className="font-bold">{i + 1}.</span> {name} — {sets} sets × {reps} reps · Rest {rest}s
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 4. Progress */}
      <section aria-labelledby="progress-title" className="landing-cream py-20 md:py-28" data-story="progress">
        <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-4 md:grid-cols-2">
          <div>
            <Kicker n="04" label="Progress" />
            <h2 id="progress-title" className="l-h2 mt-3">
              Progress you can see
            </h2>
            <p className="landing-dim mt-4 text-lg">
              Weekly check-ins feed stat cards and weight, adherence and plans-by-type charts for
              each client. Shown here: sample data from the 6-month demo.
            </p>
            <TryLink />
          </div>
          <div className="landing-card p-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["74.1", 1, " kg", "Current weight"],
                ["84", 0, "%", "Avg adherence"],
                ["26", 0, "", "Check-ins"],
              ].map(([value, decimals, suffix, label]) => (
                <div key={label as string} className="rounded-lg p-2" style={{ background: "#f1ede6" }}>
                  <div className="font-heading text-2xl font-bold" data-anim="count" data-to={value} data-decimals={decimals} data-suffix={suffix}>
                    {value}
                    {suffix}
                  </div>
                  <div className="landing-dim text-[11px] font-semibold uppercase">{label}</div>
                </div>
              ))}
            </div>
            <svg viewBox="0 0 300 110" className="mt-4 h-auto w-full" role="img" aria-label="Weight falling from 82 to 74.1 kg while adherence stays around 80 to 90 percent">
              <polyline points={linePoints(WEIGHT, 72, 84)} fill="none" stroke="#ff4a1f" strokeWidth="3" pathLength={1} data-anim="line" style={{ strokeDasharray: 1, strokeDashoffset: 0 }} />
              <polyline points={linePoints(ADHERENCE, 60, 100)} fill="none" stroke="#0e7c6b" strokeWidth="3" pathLength={1} data-anim="line" style={{ strokeDasharray: 1, strokeDashoffset: 0 }} />
            </svg>
            <p className="landing-dim mt-2 text-xs">
              <span style={{ color: "#ff4a1f" }}>■</span> Weight <span className="ml-3" style={{ color: "#0e7c6b" }}>■</span> Adherence
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
