import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  addReviewItem,
  askAI,
  autoAssign,
  createAssignment,
  listChat,
  queryKeys,
  type AiSuggestion,
} from "../api";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import type { Assignment, AssignmentType, ChatMessage, Client } from "../types";
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
      <p className="mt-1 text-sm text-dim">Selected: {client ? client.name : "none"}</p>

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
  ["Workout", "Auto-assign Workout"],
  ["Nutrition", "Nutrition"],
  ["Habit", "Habit"],
  ["Recovery", "Recovery"],
];

// One-tap generators: the AI writes ONE complete plan of the chosen type and the server
// SAVES it (the coach asked for it explicitly). If the AI fails, nothing is saved.
function AutoAssignPanel({ client, onOpenPlanner }: { client: Client; onOpenPlanner: () => void }) {
  const queryClient = useQueryClient();
  // Blocks a second request before the disabled state has re-rendered (fast double click).
  const running = useRef(false);
  const generate = useMutation({
    mutationFn: (type: AssignmentType) => autoAssign(client.id, { type, date: localToday() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assignments(client.id) }),
    onSettled: () => {
      running.current = false;
    },
  });

  const run = (type: AssignmentType) => {
    if (running.current) return;
    running.current = true;
    generate.mutate(type);
  };

  const saved = generate.isSuccess ? generate.data[0] : undefined;

  return (
    <section className="mt-4">
      <div role="group" aria-label="Auto-assign" className="flex flex-wrap gap-2">
        {AUTO_ASSIGN_BUTTONS.map(([type, label]) => (
          <button
            key={type}
            type="button"
            disabled={generate.isPending}
            onClick={() => run(type)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60 ${TYPE_CHIP[type]}`}
          >
            {generate.isPending && generate.variables === type ? "Generating..." : label}
          </button>
        ))}
      </div>
      {generate.isError && (
        <p role="alert" className="mt-3 rounded-card border border-border bg-surface2 px-4 py-2.5 text-text">
          {/* A failed generation (502) carries the server's own message, which says nothing was saved. */}
          {generate.error instanceof ApiError && generate.error.status === 502
            ? generate.error.message
            : plainErrorMessage(generate.error)}
        </p>
      )}
      {saved && <AutoAssignedCard assignment={saved} clientName={client.name} onOpenPlanner={onOpenPlanner} />}
    </section>
  );
}

function AutoAssignedCard({
  assignment,
  clientName,
  onOpenPlanner,
}: {
  assignment: Assignment;
  clientName: string;
  onOpenPlanner: () => void;
}) {
  return (
    <section aria-label="Auto-assigned plan" className="card mt-3 p-4">
      <p className="text-sm font-bold text-accent2">✓ Saved to {clientName}'s plans</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h3 className="text-lg">{assignment.title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[assignment.type]}`}>
          {assignment.type}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-text">{assignment.details}</p>
      {assignment.reasoning.trim() !== "" && <p className="mt-2 text-sm text-dim">Why: {assignment.reasoning}</p>}
      <button type="button" onClick={onOpenPlanner} className="mt-3 text-sm font-semibold text-accent2 underline">
        View in Manual Planner
      </button>
    </section>
  );
}

type SuggestionCardProps = {
  clientId: string;
  suggestion: AiSuggestion;
  onDismiss: () => void;
  onOpenPlanner: () => void;
};

// RULE: nothing is EVER auto-saved. An AI suggestion becomes an assignment only when the
// coach taps "Assign to client"; "Dismiss" (or asking again) discards it without saving.
function SuggestionCard({ clientId, suggestion, onDismiss, onOpenPlanner }: SuggestionCardProps) {
  const queryClient = useQueryClient();
  const park = useMutation({
    mutationFn: () =>
      addReviewItem({
        clientId,
        kind: "suggestion",
        title: suggestion.title,
        summary: suggestion.reasoning,
        type: suggestion.type,
        details: suggestion.details,
        reasoning: suggestion.reasoning,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reviewQueue("pending") }),
  });
  const assign = useMutation({
    mutationFn: () =>
      createAssignment(clientId, {
        type: suggestion.type,
        title: suggestion.title,
        details: suggestion.details,
        reasoning: suggestion.reasoning,
        source: "ai",
        date: localToday(),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.assignments(clientId) }),
  });

  return (
    <section aria-label="AI suggestion" className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg">{suggestion.title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[suggestion.type]}`}>
          {suggestion.type}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-text">{suggestion.details}</p>
      {suggestion.reasoning.trim() !== "" && (
        <p className="mt-2 text-sm text-dim">Why: {suggestion.reasoning}</p>
      )}
      {park.isSuccess && !assign.isSuccess ? (
        <p className="mt-3 text-sm font-bold text-accent2">✓ Sent to the review queue on Home</p>
      ) : assign.isSuccess ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-accent2">✓ Assigned</span>
          <button type="button" onClick={onOpenPlanner} className="text-sm font-semibold text-accent2 underline">
            View in Manual Planner
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={assign.isPending}
              onClick={() => assign.mutate()}
              className="btn-primary rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {assign.isPending ? "Assigning..." : "Assign to client"}
            </button>
            <button
              type="button"
              disabled={assign.isPending || park.isPending}
              onClick={() => park.mutate()}
              className={secondaryButton}
            >
              {park.isPending ? "Sending..." : "Review later"}
            </button>
            <button type="button" disabled={assign.isPending || park.isPending} onClick={onDismiss} className={secondaryButton}>
              Dismiss
            </button>
          </div>
          {assign.isError && (
            <p role="alert" className="mt-2 rounded-lg bg-surface2 px-3 py-2 text-sm text-text">
              {plainErrorMessage(assign.error)}
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
                "max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-2.5 " +
                (isCoach ? "bg-accent text-on-accent" : "border border-border bg-surface text-text")
              }
            >
              {m.content}
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
