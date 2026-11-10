// Interactive landing demo (Prompt 40). Front-end only: ZERO API calls, nothing stored.
// Pick a sample client, ask, watch "Thinking...", the answer typing out, and the plan card
// flying into the mini plan list with its reasoning. Reduced motion: no typing, no flight.
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  DEMO_CLIENTS,
  DEMO_TYPES,
  SAMPLE_NOTE,
  TYPE_COLOUR,
  demoAnswer,
  type DemoAnswer,
  type DemoPlan,
  type DemoType,
} from "./demoData";
import { useLandingEnv } from "./useLandingEnv";

type Phase = "idle" | "thinking" | "typing" | "done";
const THINK_MS = 1000;

function TypeChip({ type }: { type: DemoType }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: TYPE_COLOUR[type], color: type === "Recovery" || type === "Nutrition" ? "#ffffff" : "#141414" }}>
      {type}
    </span>
  );
}

function PlanCard({ plan, flying }: { plan: DemoPlan; flying?: boolean }) {
  return (
    <div data-testid="demo-plan" className={`landing-card p-3 ${flying ? "demo-fly-in" : ""}`}>
      <TypeChip type={plan.type} />
      <p className="mt-2 text-sm font-bold">{plan.title}</p>
      <p className="mt-1 whitespace-pre-line text-xs">{plan.details}</p>
      <p className="landing-dim mt-1 text-xs" data-testid="demo-reasoning">
        Why: {plan.reasoning}
      </p>
    </div>
  );
}

export default function DemoWidget() {
  const { reducedMotion } = useLandingEnv();
  const [clientId, setClientId] = useState(DEMO_CLIENTS[0].id);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [asked, setAsked] = useState("");
  const [reply, setReply] = useState<DemoAnswer | null>(null);
  const [shown, setShown] = useState(""); // typed-so-far answer text
  const [plans, setPlans] = useState<Record<string, DemoPlan[]>>({}); // in memory only
  const timers = useRef<number[]>([]);
  const client = DEMO_CLIENTS.find((c) => c.id === clientId)!;
  const busy = phase === "thinking" || phase === "typing";

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  function finish(answer: DemoAnswer, forClient: string) {
    setShown(answer.answer);
    setPhase("done");
    if (answer.plan) setPlans((p) => ({ ...p, [forClient]: [answer.plan!, ...(p[forClient] ?? [])].slice(0, 4) }));
  }

  function ask(input: DemoType | string, label: string) {
    if (busy) return;
    clearTimers();
    const answer = demoAnswer(client, input);
    const forClient = client.id;
    setAsked(label);
    setReply(answer);
    setShown("");
    setPhase("thinking");
    timers.current.push(
      window.setTimeout(() => {
        if (reducedMotion) return finish(answer, forClient);
        setPhase("typing");
        const words = answer.answer.split(" ");
        words.forEach((_, i) => {
          timers.current.push(
            window.setTimeout(() => {
              setShown(words.slice(0, i + 1).join(" "));
              if (i === words.length - 1) finish(answer, forClient);
            }, i * 45),
          );
        });
      }, THINK_MS),
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    ask(q, q);
    setQuestion("");
  }

  function pickClient(id: string) {
    if (busy) return;
    clearTimers();
    setClientId(id);
    setPhase("idle");
    setReply(null);
    setShown("");
    setAsked("");
  }

  const clientPlans = plans[clientId] ?? [];

  return (
    <div className="landing-card mt-6 grid gap-6 p-4 md:grid-cols-[3fr_2fr] md:p-6" data-testid="demo-widget">
      <div>
        <p className="inline-block rounded-full px-3 py-1 text-xs font-bold" style={{ background: "#f1ede6" }}>
          Demo - sample data
        </p>
        <div role="group" aria-label="Demo client" className="mt-4 flex flex-wrap gap-2">
          {DEMO_CLIENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === clientId}
              disabled={busy}
              onClick={() => pickClient(c.id)}
              className="min-h-10 rounded-full border-2 px-4 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: c.id === clientId ? "#ff4a1f" : "#e6e0d6", background: "#ffffff" }}
            >
              {c.name.split(" ")[0]}
            </button>
          ))}
        </div>
        <p className="landing-dim mt-2 text-xs">
          {client.name} · {client.goal} · {client.level}
        </p>

        <div role="group" aria-label="Quick ask" className="mt-4 flex flex-wrap gap-2">
          {DEMO_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={busy}
              onClick={() => ask(t, `Suggest a ${t.toLowerCase()} plan for ${client.name.split(" ")[0]}`)}
              className="min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: TYPE_COLOUR[t], background: "#ffffff" }}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-3 flex gap-2" aria-label="Ask the demo AI">
          <label htmlFor="demo-question" className="sr-only">
            Ask about {client.name}
          </label>
          <input
            id="demo-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask about ${client.name.split(" ")[0]}...`}
            autoComplete="off"
            className="min-h-10 min-w-0 flex-1 rounded-lg border px-3 text-sm"
            style={{ borderColor: "#e6e0d6", background: "#f1ede6" }}
          />
          <button type="submit" disabled={busy || !question.trim()} className="btn-primary min-h-10 rounded-lg px-4 text-sm disabled:opacity-60">
            {busy ? "Thinking..." : "Ask"}
          </button>
        </form>

        <div className="mt-4 flex min-h-40 flex-col gap-2" aria-live="polite" data-testid="demo-chat">
          {asked && (
            <p className="ml-auto max-w-[85%] rounded-2xl px-3 py-2 text-sm font-semibold" style={{ background: "#ff4a1f", color: "#141414" }}>
              {asked}
            </p>
          )}
          {phase === "thinking" && <p className="landing-dim text-sm" data-testid="demo-thinking">Thinking...</p>}
          {(phase === "typing" || phase === "done") && reply && (
            <div className="landing-card max-w-[90%] px-3 py-2 text-sm" data-testid="demo-answer" data-done={phase === "done"}>
              <p>{shown}</p>
              {phase === "done" && <p className="landing-dim mt-2 text-xs">{SAMPLE_NOTE}</p>}
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg">Plan list · {client.name.split(" ")[0]}</h3>
        {clientPlans.length === 0 && (
          <p className="landing-dim mt-3 text-sm">Ask for a plan to see it assigned here, with its reasoning.</p>
        )}
        <ul className="mt-3 flex flex-col gap-2" aria-label="Demo plan list">
          {clientPlans.map((p, i) => (
            <li key={`${p.title}-${clientPlans.length - i}`}>
              <PlanCard plan={p} flying={i === 0 && !reducedMotion} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
