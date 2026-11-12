import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { FormattedText, PlanDetails, inline } from "../components/FormattedText";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  addReviewItem,
  askAI,
  autoAssign,
  createAssignment,
  listChat,
  queryKeys,
  type AiDraft,
  type AiSuggestion,
} from "../api";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import type { AssignmentType, ChatMessage, Client } from "../types";
import { TYPE_CHIP } from "../lib/typeChip";

type Props = { client: Client | null; onOpenPlanner: () => void };

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const QUICK_PROMPTS = [
  "Summarise this client",
  "What should I focus on this week?",
  "Make a workout plan",
  "Make a nutrition plan",
];

// The type chip colours live in lib/typeChip.ts (shared with the client app); re-exported for old imports.
export { TYPE_CHIP };

const secondaryButton =
  "rounded-lg border border-border bg-surface2 px-3 py-1.5 text-sm font-semibold text-text hover:border-dim disabled:cursor-not-allowed disabled:opacity-60";

// AI Coach tab: the selected client's summary, saved conversation
// (GET /api/clients/:clientId/chat) and a composer that asks the AI (POST .../chat).
export function AiCoachTab({ client, onOpenPlanner }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [suggestionKey, setSuggestionKey] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const chatQuery = useQuery({
    queryKey: queryKeys.chat(client?.id ?? "none"),
    queryFn: () => listChat(client!.id),
    enabled: !!client,
  });

  const ask = useMutation({
    mutationFn: (question: string) => askAI(client!.id, question),
    onSuccess: (result, sent) => {
      // Only clear the composer if the coach hasn't typed something else meanwhile.
      setDraft((current) => (current === sent ? "" : current));
      setSuggestion(result.suggestion);
      setSuggestionKey((k) => k + 1);
      return queryClient.invalidateQueries({ queryKey: queryKeys.chat(client!.id) });
    },
  });

  const send = (text: string) => {
    if (!client || ask.isPending || !text.trim()) return;
    setSuggestion(null);
    ask.mutate(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    send(draft);
  };

  // Keep the newest message (and the pending / error / suggestion area) in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatQuery.data, ask.isPending, ask.error, suggestion]);

  return (
    <>
      <h2 className="text-2xl">AI Coach</h2>

      {client && <ClientSummary client={client} />}

      {/* Keyed by client so a result or error never shows under another client. */}
      {client && <AutoAssignPanel key={client.id} client={client} onOpenPlanner={onOpenPlanner} />}

      <div className="mt-4">
        {client && (chatQuery.isPending || (chatQuery.isError && chatQuery.isFetching)) ? (
          <LoadingState />
        ) : chatQuery.isError ? (
          <ErrorState error={chatQuery.error} onRetry={() => void chatQuery.refetch()} />
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            <Conversation messages={chatQuery.data ?? []} />
            {ask.isError && (
              <div role="alert" className="rounded-card border border-border bg-surface2 px-4 py-2.5 text-text">
                {plainErrorMessage(ask.error)}
              </div>
            )}
            {client && suggestion && (
              // A new suggestion object remounts the card, so its Assigned / error state resets.
              <SuggestionCard
                key={suggestionKey}
                clientId={client.id}
                suggestion={suggestion}
                onDismiss={() => setSuggestion(null)}
                onOpenPlanner={onOpenPlanner}
              />
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div role="group" aria-label="Quick prompts" className="mt-4 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={!client || ask.isPending}
            onClick={() => send(prompt)}
            className={secondaryButton + " rounded-full"}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <textarea
          aria-label="Ask the AI coach"
          rows={2}
          value={draft}
          disabled={!client}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={client ? `Ask about ${client.name.split(" ")[0]}...` : "Ask the AI coach..."}
          className="min-w-0 flex-1 resize-y rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          disabled={!client || ask.isPending || !draft.trim()}
          onClick={() => send(draft)}
          className="btn-primary rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ask.isPending ? "Thinking..." : "Send"}
        </button>
      </div>
    </>
  );
}

function ClientSummary({ client }: { client: Client }) {
  const rows: [string, string][] = [
    ["Goal", client.goal],
    ["Level", client.level],
    ["Weight", client.weightKg === null ? "-" : `${client.weightKg} kg`],
    ["Focus", client.focus || "-"],
    ["Notes", client.notes || "-"],
  ];
  return (
    <section aria-label="Client summary" className="card mt-4 p-4">
      <h3 className="text-lg">{client.name}</h3>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-dim">{label}</dt>
            <dd className="whitespace-pre-wrap text-text">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Today in the coach's local time, as "YYYY-MM-DD". */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const AUTO_ASSIGN_BUTTONS: [AssignmentType, string][] = [
  ["Workout", "Workout"],
  ["Nutrition", "Nutrition"],
  ["Habit", "Habit"],
  ["Recovery", "Recovery"],
];

// One-tap drafts: the AI writes ONE complete plan of the chosen type. Nothing is saved - the draft opens
// in the same card as a chat suggestion, where the coach assigns it, edits it first, parks it or discards it.
function AutoAssignPanel({ client, onOpenPlanner }: { client: Client; onOpenPlanner: () => void }) {
  // Blocks a second request before the disabled state has re-rendered (fast double click).
  const running = useRef(false);
  const [draft, setDraft] = useState<{ plan: AiDraft; key: number } | null>(null);
  const generate = useMutation({
    mutationFn: (type: AssignmentType) => autoAssign(client.id, { type, date: localToday() }),
    onMutate: () => setDraft(null),
    onSuccess: (res) => setDraft((d) => ({ plan: res.draft, key: (d?.key ?? 0) + 1 })),
    onSettled: () => {
      running.current = false;
    },
  });

  const run = (type: AssignmentType) => {
    if (running.current) return;
    running.current = true;
    generate.mutate(type);
  };

  return (
    <section className="mt-4">
      <p className="mb-2 text-sm text-dim">Draft a plan with AI - you review it before anything reaches {client.name}.</p>
      <div role="group" aria-label="Draft a plan with AI" className="flex flex-wrap gap-2">
        {AUTO_ASSIGN_BUTTONS.map(([type, label]) => (
          <button
            key={type}
            type="button"
            disabled={generate.isPending}
            onClick={() => run(type)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${TYPE_CHIP[type]}`}
          >
            {generate.isPending && generate.variables === type ? "Drafting..." : label}
          </button>
        ))}
      </div>
      {generate.isError && (
        <p role="alert" className="mt-3 rounded-card border border-border bg-surface2 px-4 py-2.5 text-text">
          {generate.error instanceof ApiError && generate.error.status === 502
            ? generate.error.message
            : plainErrorMessage(generate.error)}
        </p>
      )}
      {draft && (
        <div className="mt-3">
          <SuggestionCard
            key={draft.key}
            label="AI draft"
            clientId={client.id}
            clientName={client.name}
            suggestion={draft.plan}
            date={draft.plan.date}
            onDismiss={() => setDraft(null)}
            onOpenPlanner={onOpenPlanner}
          />
        </div>
      )}
    </section>
  );
}

type SuggestionCardProps = {
  clientId: string;
  clientName?: string;
  suggestion: AiSuggestion;
  /** The day it is assigned for (default today). */
  date?: string;
  /** The card's accessible name. */
  label?: string;
  onDismiss: () => void;
  onOpenPlanner: () => void;
};

// RULE: nothing is EVER auto-saved. An AI suggestion or draft becomes an assignment only when the coach
// taps "Assign to client" (as written, or after "Edit"); "Dismiss" (or asking again) drops it unsaved.
function SuggestionCard({ clientId, clientName, suggestion, date, label = "AI suggestion", onDismiss, onOpenPlanner }: SuggestionCardProps) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState({ title: suggestion.title, details: suggestion.details, reasoning: suggestion.reasoning });
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const edited = plan.title !== suggestion.title || plan.details !== suggestion.details || plan.reasoning !== suggestion.reasoning;
  const valid = () => {
    if (plan.title.trim() === "") return "Give the plan a title.";
    if (plan.details.trim() === "") return "The plan needs some details.";
    return null;
  };
  const park = useMutation({
    mutationFn: () =>
      addReviewItem({
        clientId,
        kind: "suggestion",
        title: plan.title.trim(),
        summary: plan.reasoning.trim(),
        type: suggestion.type,
        details: plan.details.trim(),
        reasoning: plan.reasoning.trim(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reviewQueue("pending") }),
  });
  const assign = useMutation({
    mutationFn: () =>
      createAssignment(clientId, {
        type: suggestion.type,
        title: plan.title.trim(),
        details: plan.details.trim(),
        reasoning: plan.reasoning.trim(),
        source: "ai",
        date: date ?? localToday(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assignments(clientId) }),
  });
  const act = (m: { mutate: () => void }) => {
    const problem = valid();
    setEditError(problem);
    if (problem) {
      setEditing(true);
      return;
    }
    setEditing(false);
    m.mutate();
  };
  const busy = assign.isPending || park.isPending;
  const field = "w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text";

  return (
    <section aria-label={label} className="card p-4">
      {editing ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[suggestion.type]}`}>{suggestion.type}</span>
            <span className="text-sm text-dim">Editing - nothing is saved until you assign it.</span>
          </div>
          <div>
            <label htmlFor={`${label}-title`} className="mb-1 block text-sm font-semibold">
              Title
            </label>
            <input id={`${label}-title`} value={plan.title} maxLength={200} onChange={(e) => setPlan({ ...plan, title: e.target.value })} className={field} />
          </div>
          <div>
            <label htmlFor={`${label}-details`} className="mb-1 block text-sm font-semibold">
              Plan details
            </label>
            <textarea
              id={`${label}-details`}
              value={plan.details}
              rows={Math.min(18, Math.max(6, plan.details.split("\n").length + 1))}
              maxLength={6000}
              onChange={(e) => setPlan({ ...plan, details: e.target.value })}
              className={`${field} font-mono`}
            />
            <p className="mt-1 text-xs text-dim">Exercise lines: 1. Bench Press — 4 sets × 6 reps · 60 kg · Rest 120s</p>
          </div>
          <div>
            <label htmlFor={`${label}-why`} className="mb-1 block text-sm font-semibold">
              Why this plan
            </label>
            <textarea
              id={`${label}-why`}
              value={plan.reasoning}
              rows={3}
              maxLength={2000}
              onChange={(e) => setPlan({ ...plan, reasoning: e.target.value })}
              className={field}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg">{plan.title}</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[suggestion.type]}`}>{suggestion.type}</span>
            {edited && <span className="text-xs font-semibold text-dim">Edited</span>}
          </div>
          <div className="mt-3">
            <PlanDetails details={plan.details} />
          </div>
          {plan.reasoning.trim() !== "" && <p className="mt-2 text-sm text-dim">Why: {inline(plan.reasoning)}</p>}
        </>
      )}
      {editError && (
        <p role="alert" className="mt-2 rounded-lg bg-surface2 px-3 py-2 text-sm text-text">
          {editError}
        </p>
      )}
      {park.isSuccess && !assign.isSuccess ? (
        <p className="mt-3 text-sm font-bold text-accent2">✓ Sent to the review queue on Home</p>
      ) : assign.isSuccess ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-accent2">✓ Assigned{clientName ? ` to ${clientName}` : ""}</span>
          <button type="button" onClick={onOpenPlanner} className="text-sm font-semibold text-accent2 underline">
            View in Plans
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => act(assign)}
              className="btn-primary rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {assign.isPending ? "Assigning..." : "Assign to client"}
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={editing}
              onClick={() => {
                if (editing) {
                  const problem = valid();
                  setEditError(problem);
                  if (problem) return;
                }
                setEditing(!editing);
              }}
              className={secondaryButton}
            >
              {editing ? "Done editing" : "Edit"}
            </button>
            <button type="button" disabled={busy} onClick={() => act(park)} className={secondaryButton}>
              {park.isPending ? "Sending..." : "Review later"}
            </button>
            <button type="button" disabled={busy} onClick={onDismiss} className={secondaryButton}>
              Dismiss
            </button>
          </div>
          {(assign.isError || park.isError) && (
            <p role="alert" className="mt-2 rounded-lg bg-surface2 px-3 py-2 text-sm text-text">
              {plainErrorMessage(assign.error ?? park.error)}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Conversation({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-card bg-surface2 px-4 py-6 text-center text-dim">
        No conversation yet - ask your first question below.
      </div>
    );
  }
  return (
    <ol aria-label="Conversation" className="flex flex-col gap-3">
      {messages.map((m) => {
        const isCoach = m.role === "coach";
        return (
          <li key={m.id} className={"flex flex-col " + (isCoach ? "items-end" : "items-start")}>
            <div
              className={
                "max-w-[85%] rounded-card px-4 py-2.5 " +
                (isCoach ? "whitespace-pre-wrap bg-accent text-on-accent" : "border border-border bg-surface text-text")
              }
            >
              {isCoach ? m.content : <FormattedText text={m.content} />}
            </div>
            <span className="mt-1 text-xs text-dim">
              {isCoach ? "You" : "AI coach"} · {timeFormat.format(new Date(m.createdAt))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
