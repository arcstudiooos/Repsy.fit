// Messages tab (Prompt 63): the shell for coach <-> client messages.
// This is the CLIENT conversation - a different thing from the AI Coach chat, with its own
// endpoint and table. Not real-time: it refreshes on open and every 20 seconds while open.
// Prompt 64 adds the conversation list, bubbles and the message box.
import { useQuery } from "@tanstack/react-query";
import { getMessageThread, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import type { Client, ThreadMessage } from "../types";

/** How often the open thread is re-fetched. There are no WebSockets or push in v2. */
export const MESSAGES_POLL_MS = 20_000;

export function MessagesTab({ client }: { client: Client | null }) {
  return (
    <>
      <h2 className="text-2xl">Messages</h2>
      <p className="mt-1 text-dim">
        {client ? `Conversation with ${client.name}` : "Pick a client above to read your conversation."}
      </p>
      <p className="mt-1 text-sm text-dim">
        Not live: messages refresh when you open this tab and every 20 seconds.
      </p>
      {client && <Thread key={client.id} client={client} />}
    </>
  );
}

function Thread({ client }: { client: Client }) {
  const query = useQuery({
    queryKey: queryKeys.messages(client.id),
    queryFn: () => getMessageThread(client.id),
    refetchInterval: MESSAGES_POLL_MS,
    // Opening the tab always fetches; a hidden browser tab stops polling.
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
  });

  // A failed background poll keeps the thread on screen (with a short note) instead of
  // swapping it for an error and then a spinner every 20 seconds.
  if (query.data === undefined && (query.isPending || (query.isError && query.isFetching))) {
    return (
      <div className="mt-4">
        <LoadingState />
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <div className="mt-4">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const { messages, hasMore } = query.data;
  return (
    <section aria-label={`Messages with ${client.name}`} className="card mt-4 p-5">
      {query.isError && (
        <p role="status" className="mb-2 text-sm text-dim">
          Couldn't refresh just now. Showing the last messages we loaded.
        </p>
      )}
      {messages.length === 0 ? (
        <p className="text-dim">No messages with {client.name} yet.</p>
      ) : (
        <>
          {hasMore && <p className="mb-2 text-xs text-dim">Showing the latest 50 messages.</p>}
          <ol aria-label="Conversation" className="space-y-3">
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} clientName={client.name} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function MessageRow({ message, clientName }: { message: ThreadMessage; clientName: string }) {
  const who = message.sender === "coach" ? "You" : clientName;
  const when = new Date(message.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return (
    <li data-sender={message.sender}>
      <p className="text-xs font-bold text-dim">
        {who} <span className="font-mono font-normal">{when}</span>
      </p>
      {/* Plain text, always: React escapes it, and line breaks are kept with pre-wrap. */}
      <p className="whitespace-pre-wrap break-words text-text">{message.body}</p>
    </li>
  );
}
