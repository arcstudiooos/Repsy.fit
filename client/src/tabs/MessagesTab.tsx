// Messages tab (Prompts 63-64): coach <-> client messages.
// This is the CLIENT conversation - a different thing from the AI Coach chat, with its own
// endpoints, table and components (nothing here is shared with AiCoachTab). Not real-time: the
// list and the open thread refresh when the tab opens and every 20 seconds while it is visible.
// The list shows each conversation's last message, how long ago it was sent and an unread count.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMessageThread, listThreads, queryKeys, sendMessage } from "../api";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import type { Client, ThreadMessage, ThreadSummary } from "../types";
import { relativeTime } from "../lib/dates";
import { ClientSnapshotCards } from "../components/ClientSnapshotCards";

/** How often the list and the open thread are re-fetched. There are no WebSockets or push in v2. */
export const MESSAGES_POLL_MS = 20_000;
const PREVIEW_CHARS = 60;

type Props = {
  clients: Client[];
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
};

/**
 * Unsent bubbles and drafts per client. The dashboard owns this (see `useChatState`), above both
 * the per-client pane and this tab, so neither switching client nor switching to another tab
 * mid-send loses a message: a send that fails meanwhile waits, with Retry, in its conversation,
 * and the list marks it "Not sent".
 */
export type ChatState = { pendingBy: Record<string, Pending[]>; drafts: Record<string, string> };

type TabProps = Props & { chat: ChatState; setChat: (update: (old: ChatState) => ChatState) => void };

export function MessagesTab({ clients, selectedClientId, onSelect, chat, setChat }: TabProps) {
  const client = clients.find((c) => c.id === selectedClientId) ?? null;
  const { pendingBy, drafts } = chat;
  const setPendingBy = (update: (all: ChatState["pendingBy"]) => ChatState["pendingBy"]) =>
    setChat((old) => ({ ...old, pendingBy: update(old.pendingBy) }));
  const setDrafts = (update: (all: ChatState["drafts"]) => ChatState["drafts"]) =>
    setChat((old) => ({ ...old, drafts: update(old.drafts) }));
  const failedFor = useMemo(
    () => new Set(Object.entries(pendingBy).filter(([, list]) => list.some((p) => p.status === "failed")).map(([id]) => id)),
    [pendingBy],
  );
  // Phone (<md) is a master-detail flow: the list first, then a full-width thread with a Back
  // button. Desktop keeps the two-column view. The desktop specs and all chat state are unchanged.
  const [mobileThread, setMobileThread] = useState(false);
  const openClient = (id: string) => {
    onSelect(id);
    setMobileThread(true);
  };
  return (
    <>
      <h2 className="page-title">Messages</h2>
      <p className="mt-1 text-sm text-dim">Your conversations with clients.</p>
      {/* minmax(0, 1fr): grid tracks may shrink below their content, so a long preview or the
          message box placeholder can never push the page sideways on a phone. */}
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-0 md:grid-cols-[17rem_minmax(0,1fr)] md:gap-4">
        <div className={mobileThread ? "hidden md:block" : "block"}>
          <ConversationList clients={clients} selectedClientId={selectedClientId} onSelect={openClient} failedFor={failedFor} />
        </div>
        {client ? (
          <div className={mobileThread ? "block" : "hidden md:block"}>
            <Conversation
              key={client.id}
              client={client}
              onBack={() => setMobileThread(false)}
              pending={pendingBy[client.id] ?? []}
              setPending={(update) =>
                setPendingBy((all) => ({ ...all, [client.id]: update(all[client.id] ?? []) }))
              }
              setPendingFor={(clientId, update) =>
                setPendingBy((all) => ({ ...all, [clientId]: update(all[clientId] ?? []) }))
              }
              draft={drafts[client.id] ?? ""}
              setDraft={(text) => setDrafts((all) => ({ ...all, [client.id]: text }))}
            />
          </div>
        ) : (
          <section className="card p-6 text-dim">Pick a client to open your conversation.</section>
        )}
      </div>
    </>
  );
}

// ----- Conversation list -----

function ConversationList({ clients, selectedClientId, onSelect, failedFor }: Props & { failedFor: Set<string> }) {
  const [search, setSearch] = useState("");
  const threads = useQuery({
    queryKey: queryKeys.threads,
    queryFn: listThreads,
    refetchInterval: MESSAGES_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
  });
  const byClient = useMemo(
    () => new Map<string, ThreadSummary>((threads.data?.threads ?? []).map((t) => [t.clientId, t])),
    [threads.data],
  );
  const term = search.trim().toLowerCase();
  // "Waiting for a reply" = the client spoke last and the coach hasn't answered. Messages' one job is
  // that no client waits unseen, so these sort ABOVE everything, longest-waiting first; the rest fall
  // in by most-recent. (unreadCount can be 0 on a read-but-unanswered message, so sender is the signal.)
  const isWaiting = (id: string) => byClient.get(id)?.lastMessage?.sender === "client";
  const shown = clients
    .filter((c) => c.name.toLowerCase().includes(term))
    .sort((a, b) => {
      const aw = isWaiting(a.id);
      const bw = isWaiting(b.id);
      if (aw !== bw) return aw ? -1 : 1;
      const at = byClient.get(a.id)?.lastMessage?.createdAt ?? "";
      const bt = byClient.get(b.id)?.lastMessage?.createdAt ?? "";
      if (at === bt) return 0;
      // Among waiting, OLDEST first (the client kept waiting longest). Otherwise newest first.
      return aw ? (at < bt ? -1 : 1) : at < bt ? 1 : -1;
    });
  const waitingCount = clients.filter((c) => isWaiting(c.id)).length;

  return (
    <section aria-label="Conversations" className="py-1">
      <label htmlFor="message-search" className="sr-only">
        Search clients by name
      </label>
      <input
        id="message-search"
        type="search"
        placeholder="Search clients"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="min-h-11 w-full rounded-none border-0 border-b border-border-strong bg-transparent px-0 text-base text-text placeholder:text-dim focus:border-accent2"
      />
      {threads.isError && threads.data === undefined && (
        <p role="status" className="mt-2 text-sm text-dim">
          Couldn't load message previews.
        </p>
      )}
      {waitingCount > 0 && (
        <p className="mt-2 px-1 text-xs font-bold tracking-wide text-amber-text uppercase">
          {waitingCount} waiting for reply
        </p>
      )}
      {shown.length === 0 ? (
        <p className="mt-3 px-1 text-sm text-dim">No clients match "{search.trim()}".</p>
      ) : (
        <ul aria-label="Clients" className="mt-1 divide-y divide-border">
          {shown.map((c) => {
            const summary = byClient.get(c.id);
            const selected = c.id === selectedClientId;
            // The open conversation is being read right now, so it never shows a dot.
            const unread = !selected && (summary?.unreadCount ?? 0) > 0;
            const waiting = summary?.lastMessage?.sender === "client";
            const last = summary?.lastMessage;
            const failed = failedFor.has(c.id);
            const preview = failed
              ? "Not sent - open to retry"
              : last
                ? `${last.sender === "coach" ? "You: " : ""}${last.body}`
                : "No messages yet";
            // Array.from counts characters, not UTF-16 halves, so an emoji is never cut in two.
            const chars = Array.from(preview);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={selected ? "true" : undefined}
                  aria-label={`${c.name}${unread ? `, ${summary!.unreadCount} unread` : ""}`}
                  onClick={() => onSelect(c.id)}
                  className={
                    "flex min-h-11 w-full items-start gap-2 px-2 py-3 text-left " +
                    (selected ? "bg-surface2" : "hover:bg-surface2")
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={"min-w-0 flex-1 truncate text-sm text-text " + (unread ? "font-bold" : "font-semibold")}>
                        {c.name}
                      </span>
                      {waiting && !failed && (
                        <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-[11px] font-bold text-amber-text">Waiting</span>
                      )}
                      {last && !failed && (
                        <time dateTime={last.createdAt} className="shrink-0 text-xs text-dim">
                          {relativeTime(last.createdAt)}
                        </time>
                      )}
                    </span>
                    <span data-testid="thread-preview" className={"block truncate text-xs " + (failed ? "font-semibold text-amber-text" : "text-dim")}>
                      {chars.length > PREVIEW_CHARS ? `${chars.slice(0, PREVIEW_CHARS).join("")}…` : preview}
                    </span>
                  </span>
                  {unread && (
                    <span
                      data-testid="unread-dot"
                      aria-hidden="true"
                      className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent"
                    >
                      {summary!.unreadCount > 99 ? "99+" : summary!.unreadCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ----- Open conversation -----

/** A message typed here that the server has not confirmed yet. `tempId` is made on this device. */
export type Pending = {
  tempId: string;
  body: string;
  status: "sending" | "failed";
  error?: string;
  /** Saved on the server: shown as a normal bubble until a FETCHED thread includes it. */
  saved?: ThreadMessage;
};

let tempCounter = 0;
const newTempId = () => `temp-${Date.now()}-${++tempCounter}`;

type Updater = (list: Pending[]) => Pending[];

function Conversation({
  client,
  onBack,
  pending,
  setPending,
  setPendingFor,
  draft,
  setDraft,
}: {
  client: Client;
  onBack: () => void;
  pending: Pending[];
  setPending: (update: Updater) => void;
  /** For mutation callbacks: they can finish after the coach has switched to another client. */
  setPendingFor: (clientId: string, update: Updater) => void;
  draft: string;
  setDraft: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const thread = useQuery({
    queryKey: queryKeys.messages(client.id),
    queryFn: () => getMessageThread(client.id),
    refetchInterval: MESSAGES_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
  });

  // Opening a thread marks the client's messages read on the server, so clear this client's unread
  // dot in the list straight away.
  useEffect(() => {
    if (!thread.isSuccess) return;
    queryClient.setQueryData<{ threads: ThreadSummary[] }>(queryKeys.threads, (old) =>
      old ? { threads: old.threads.map((t) => (t.clientId === client.id ? { ...t, unreadCount: 0 } : t)) } : old,
    );
  }, [thread.isSuccess, thread.dataUpdatedAt, client.id, queryClient]);

  const clientId = client.id;
  const key = queryKeys.messages(clientId);
  // useMutation-level callbacks (not mutate-level ones) still run if this pane has unmounted
  // because the coach switched client, so the result always reaches the right conversation.
  const send = useMutation({
    mutationFn: ({ body }: { tempId: string; body: string }) => sendMessage(clientId, body),
    // A poll already in flight may have read the database before this INSERT; cancel it so its
    // stale answer cannot overwrite the message we are about to add.
    onMutate: () => queryClient.cancelQueries({ queryKey: key }),
    onSuccess: (saved, { tempId }) => {
      // Reconcile: the temporary bubble is replaced by the saved message - never shown twice.
      // Reconcile by id: the bubble becomes the saved message and stays until a thread FETCHED
      // from the server contains it - it is not appended to the cache by hand. So whatever lands
      // in what order (thread not loaded yet, or a refresh that read the database before this
      // INSERT), the message is on screen exactly once and never vanishes.
      setPendingFor(clientId, (list) => list.map((p) => (p.tempId === tempId ? { ...p, saved } : p)));
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads });
    },
    onError: (error, { tempId }) =>
      setPendingFor(clientId, (list) =>
        list.map((p) => (p.tempId === tempId ? { ...p, status: "failed", error: plainErrorMessage(error) } : p)),
      ),
    // Success or failure, re-fetch the thread: onMutate cancelled any load in flight, and a failed
    // send must not leave the conversation without its history until the next poll.
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  function retry(tempId: string) {
    const item = pending.find((p) => p.tempId === tempId);
    // Only a failed bubble can be retried, and it flips to "sending" right here (synchronously),
    // so a double-click cannot fire two POSTs.
    if (!item || item.status !== "failed") return;
    setPending((list) => list.map((p) => (p.tempId === tempId ? { ...p, status: "sending", error: undefined } : p)));
    send.mutate({ tempId, body: item.body });
  }

  // Drop "saved but not yet loaded" bubbles once the thread contains them (never shown twice).
  const loadedIds = useMemo(() => new Set((thread.data?.messages ?? []).map((m) => m.id)), [thread.data]);
  useEffect(() => {
    if (pending.some((p) => p.saved && loadedIds.has(p.saved.id))) {
      setPending((list) => list.filter((p) => !(p.saved && loadedIds.has(p.saved.id))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPending is a new function each render
  }, [loadedIds, pending]);
  const shownPending = pending.filter((p) => !(p.saved && loadedIds.has(p.saved.id)));

  function submit() {
    const body = draft.trim();
    if (!body) return;
    const tempId = newTempId();
    setPending((list) => [...list, { tempId, body, status: "sending" }]);
    setDraft("");
    send.mutate({ tempId, body });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter is a new line. Never send while an IME is composing a character.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  // Keep the newest message in view as the thread grows.
  const endRef = useRef<HTMLDivElement>(null);
  // Also when a send fails, so its "Not sent ... Retry" line is not left below the fold.
  const scrollKey = `${thread.data?.messages.length ?? 0}:${shownPending.map((p) => p.status).join(",")}`;
  useEffect(() => {
    // Block body on purpose: an effect must return nothing or a cleanup function (newer browsers
    // return a Promise from scrollIntoView, which React would then try to call).
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [scrollKey]);

  return (
    <div className="flex flex-col gap-3">
      {/* Context beside the chat: the client's snapshot (weight, adherence, last check-in) sits with the
          thread so the coach answers without leaving to look it up. It fails silent if there's no data,
          and stays OUTSIDE the conversation region so it never counts as a message. */}
      <div className="px-1">
        <ClientSnapshotCards clientId={client.id} today={new Date().toLocaleDateString("en-CA")} />
      </div>
      <section aria-label={`Conversation with ${client.name}`} className="card flex min-h-[26rem] flex-col p-0">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
        <button type="button" onClick={onBack} className="min-h-11 shrink-0 rounded px-1 text-sm font-semibold text-accent2 md:hidden">
          ‹ Conversations
        </button>
        <div className="min-w-0">
          <h3 className="card-title">{client.name}</h3>
          <p className="text-xs text-dim">Client messages - separate from the AI Coach</p>
        </div>
      </header>

      <div className="max-h-[28rem] flex-1 overflow-y-auto px-5 py-4">
        {thread.data === undefined && shownPending.length === 0 ? (
          thread.isError && !thread.isFetching ? (
            <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
          ) : (
            <LoadingState />
          )
        ) : (
          <>
            {thread.isError && thread.data !== undefined && (
              <p role="status" className="mb-2 text-sm text-dim">
                Couldn't refresh just now. Showing the last messages we loaded.
              </p>
            )}
            {thread.data?.hasMore && <p className="mb-2 text-center text-xs text-dim">Showing the latest 50 messages.</p>}
            {(thread.data?.messages.length ?? 0) === 0 && shownPending.length === 0 ? (
              <p className="py-8 text-center text-dim">Start the conversation - your client sees this in their app view.</p>
            ) : (
              <ol aria-label="Messages" className="space-y-3">
                {(thread.data?.messages ?? []).map((m) => (
                  <Bubble key={m.id} message={m} clientName={client.name} />
                ))}
                {shownPending.map((p) =>
                  p.saved ? (
                    <Bubble key={p.tempId} message={p.saved} clientName={client.name} />
                  ) : (
                  <PendingBubble
                    key={p.tempId}
                    pending={p}
                    onRetry={() => retry(p.tempId)}
                    onDiscard={() => setPending((list) => list.filter((x) => x.tempId !== p.tempId))}
                  />
                  ),
                )}
              </ol>
            )}
            <div ref={endRef} />
          </>
        )}
      </div>

      <form
        aria-label="Write a message"
        aria-describedby="message-hint"
        className="flex flex-wrap items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="message-box" className="sr-only">
          Message to {client.name}
        </label>
        <textarea
          id="message-box"
          rows={2}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${client.name}`}
          className="min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base text-text"
        />
        <button type="submit" disabled={!draft.trim()} className="btn btn-primary min-h-11">
          Send
        </button>
        <p id="message-hint" className="w-full text-xs text-dim">
          Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </section>
    </div>
  );
}

const timeOf = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

/** Roles read from alignment + surface + a quiet label, not a loud colour fill. Plain text only. */
function Bubble({ message, clientName }: { message: ThreadMessage; clientName: string }) {
  const mine = message.sender === "coach";
  return (
    <li data-sender={message.sender} className={"flex " + (mine ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[min(85%,65ch)] rounded-card border border-border px-4 py-2 text-text " +
          (mine ? "bg-surface2" : "bg-surface")
        }
      >
        <p className="sr-only">{mine ? "You" : clientName}:</p>
        {/* React renders this as text (never HTML); pre-wrap keeps line breaks. */}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p className="mt-1 text-[11px] tabular-nums text-dim">{timeOf(message.createdAt)}</p>
      </div>
    </li>
  );
}

function PendingBubble({ pending, onRetry, onDiscard }: { pending: Pending; onRetry: () => void; onDiscard: () => void }) {
  const failed = pending.status === "failed";
  return (
    <li data-sender="coach" data-pending={pending.status} className="flex justify-end">
      <div className="max-w-[80%] text-right">
        <div
          className={
            "rounded-card px-4 py-2 text-left " +
            (failed ? "border border-amber bg-surface text-text" : "border border-border bg-surface2 text-text")
          }
        >
          <p className="whitespace-pre-wrap break-words">{pending.body}</p>
        </div>
        {failed ? (
          <div role="alert" className="mt-1 text-xs font-semibold text-amber-text">
            <p>Not sent. {pending.error}</p>
            <p className="flex justify-end gap-4">
              <button type="button" onClick={onRetry} className="min-h-10 underline">
                Retry
              </button>
              <button type="button" onClick={onDiscard} className="min-h-10 underline">
                Discard
              </button>
            </p>
          </div>
        ) : (
          <p role="status" className="mt-1 text-xs text-dim">
            Sending…
          </p>
        )}
      </div>
    </li>
  );
}
