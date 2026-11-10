import { useQuery } from "@tanstack/react-query";
import { listChat, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import type { ChatMessage, Client } from "../types";

type Props = { client: Client | null };

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// AI Coach tab: the selected client's saved conversation (GET /api/clients/:clientId/chat).
// Asking questions arrives in a later prompt - the input is disabled for now.
export function AiCoachTab({ client }: Props) {
  const chatQuery = useQuery({
    queryKey: queryKeys.chat(client?.id ?? "none"),
    queryFn: () => listChat(client!.id),
    enabled: !!client,
  });

  return (
    <>
      <h2 className="text-2xl">AI Coach</h2>
      <p className="mt-1 text-sm text-dim">Selected: {client ? client.name : "none"}</p>

      <div className="mt-4">
        {client && (chatQuery.isPending || (chatQuery.isError && chatQuery.isFetching)) ? (
          <LoadingState />
        ) : chatQuery.isError ? (
          <ErrorState error={chatQuery.error} onRetry={() => void chatQuery.refetch()} />
        ) : (
          <Conversation messages={chatQuery.data ?? []} />
        )}
      </div>

      {/* Ask box - disabled until the ask endpoint arrives. */}
      <div className="mt-4 flex gap-2">
        <input
          disabled
          aria-label="Ask the AI coach"
          placeholder={client ? `Ask about ${client.name.split(" ")[0]}...` : "Ask the AI coach..."}
          className="min-w-0 flex-1 cursor-not-allowed rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim disabled:opacity-60"
        />
        <button type="button" disabled className="btn-primary cursor-not-allowed rounded-lg px-4 py-2 text-sm opacity-60">
          Ask
        </button>
      </div>
    </>
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
                "max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-2.5 text-text " +
                (isCoach ? "bg-surface2" : "border border-border bg-surface")
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
