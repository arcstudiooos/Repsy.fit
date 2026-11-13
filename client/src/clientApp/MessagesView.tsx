// The client's Messages tab (Prompt 82): their thread with their coach. Re-fetched on open and every
// 20 seconds while open (no websockets, like the coach's Messages tab). Opening it marks the coach's
// messages read. Enter sends, Shift+Enter is a new line. A failed send stays on screen with Retry.
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyMessages, queryKeys, sendMyMessage } from "../api";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import type { MyMessage } from "../types";

/** Same polling interval as the coach side (MESSAGES_POLL_MS in tabs/MessagesTab.tsx, not imported so the
 * coach's tab stays out of the client app's chunk). */
export const CLIENT_MESSAGES_POLL_MS = 20_000;
const MAX_CHARS = 2000;

type Pending = { tempId: string; body: string; status: "sending" | "failed"; error?: string; saved?: MyMessage };
let tempCounter = 0;

const timeOf = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function MessagesView({ coachName }: { coachName: string | null }) {
  const qc = useQueryClient();
  const thread = useQuery({
    queryKey: queryKeys.myMessages,
    queryFn: getMyMessages,
    refetchInterval: CLIENT_MESSAGES_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
  });
  // The server marks the coach's messages read on each fetch; zero the badge only after a FRESH fetch
  // (not a cached thread shown on return to the tab), cancelling a badge poll that could overwrite it.
  const mountedAt = useRef(Date.now());
  useEffect(() => {
    if (!thread.isSuccess || thread.dataUpdatedAt < mountedAt.current) return;
    void qc.cancelQueries({ queryKey: queryKeys.myUnread });
    qc.setQueryData(queryKeys.myUnread, { count: 0 });
  }, [thread.isSuccess, thread.dataUpdatedAt, qc]);

  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const send = useMutation({
    mutationFn: ({ body }: { tempId: string; body: string }) => sendMyMessage(body),
    // A poll in flight may have read before this INSERT; cancel it so it can't hide the new message.
    onMutate: () => qc.cancelQueries({ queryKey: queryKeys.myMessages }),
    onSuccess: (saved, { tempId }) => setPending((l) => l.map((p) => (p.tempId === tempId ? { ...p, saved } : p))),
    onError: (error, { tempId }) => setPending((l) => l.map((p) => (p.tempId === tempId ? { ...p, status: "failed", error: plainErrorMessage(error) } : p))),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.myMessages }),
  });

  // A saved bubble stays until a fetched thread contains it: on screen exactly once, never vanishing.
  const loadedIds = useMemo(() => new Set((thread.data?.messages ?? []).map((m) => m.id)), [thread.data]);
  useEffect(() => {
    if (pending.some((p) => p.saved && loadedIds.has(p.saved.id))) setPending((l) => l.filter((p) => !(p.saved && loadedIds.has(p.saved.id))));
  }, [loadedIds, pending]);
  const shownPending = pending.filter((p) => !(p.saved && loadedIds.has(p.saved.id)));

  const boxRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  function submit() {
    const body = draft.trim();
    if (!body || body.length > MAX_CHARS) return;
    const tempId = `t${++tempCounter}`;
    setPending((l) => [...l, { tempId, body, status: "sending" }]);
    setDraft("");
    stickToBottom.current = true;
    boxRef.current?.focus(); // the Send button disables as the draft empties; keep focus in the box
    send.mutate({ tempId, body });
  }
  function retry(tempId: string) {
    const item = pending.find((p) => p.tempId === tempId);
    if (!item || item.status !== "failed") return;
    setPending((l) => l.map((p) => (p.tempId === tempId ? { ...p, status: "sending", error: undefined } : p)));
    send.mutate({ tempId, body: item.body });
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // keyCode 229: Safari still reports the Enter that ends an IME composition this way.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      submit();
    }
  }

  // Scroll only the message box (never the page), and only when the reader is already at the bottom or
  // just sent - a poll must not pull someone back down who scrolled up to read.
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = thread.data?.messages[thread.data.messages.length - 1]?.id ?? "";
  const scrollKey = `${lastId}:${shownPending.map((p) => `${p.tempId}${p.status}`).join(",")}`;
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [scrollKey]);
  const onScroll = () => {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  // A polite announcement when a new coach message arrives by polling (not on first load).
  const [announce, setAnnounce] = useState("");
  const seenLast = useRef<string | null>(null);
  useEffect(() => {
    const list = thread.data?.messages;
    if (!list) return;
    const last = list[list.length - 1];
    if (seenLast.current !== null && last && last.id !== seenLast.current && last.sender === "coach") setAnnounce(`New message from ${coachName ?? "your coach"}`);
    seenLast.current = last?.id ?? "";
  }, [thread.data, coachName]);

  const messages = thread.data?.messages ?? [];
  const noCoach = thread.data?.hasCoach === false;
  const tooLong = draft.trim().length > MAX_CHARS;
  const who = coachName ?? "your coach";
  return (
    <>
      <h1 className="text-3xl">Messages</h1>
      <section aria-label={`Conversation with ${who}`} className="card mt-4 flex flex-col p-0">
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
        <div ref={listRef} onScroll={onScroll} className="max-h-[60vh] min-h-[22rem] flex-1 overflow-y-auto px-4 py-4 sm:min-h-[16rem]">
          {thread.data === undefined && shownPending.length === 0 ? (
            thread.isError && !thread.isFetching ? (
              <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
            ) : (
              <LoadingState />
            )
          ) : (
            <>
              {thread.isError && (
                <p role="status" className="mb-2 text-sm text-dim">
                  Couldn't refresh just now. Showing the last messages we loaded.
                </p>
              )}
              {noCoach ? (
                <p className="py-8 text-center text-dim">You don't have a coach to message right now.</p>
              ) : messages.length === 0 && shownPending.length === 0 ? (
                <p className="py-8 text-center text-dim">No messages yet. Say hi to {who} - they'll see it in their Messages tab.</p>
              ) : (
                <ol aria-label="Messages" className="space-y-3">
                  {messages.map((m, i) => {
                    const day = daySeparator(m.createdAt);
                    const newDay = i === 0 || daySeparator(messages[i - 1].createdAt) !== day;
                    return (
                      <Fragment key={m.id}>
                        {newDay && <DayLine label={day} />}
                        <Bubble m={m} who={who} />
                      </Fragment>
                    );
                  })}
                  {shownPending.map((p) =>
                    p.saved ? (
                      <Bubble key={p.tempId} m={p.saved} who={who} />
                    ) : (
                      <li key={p.tempId} className="flex flex-col items-end">
                        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-card bg-accent px-3 py-2 text-sm text-on-accent opacity-80">{p.body}</p>
                        {p.status === "sending" ? (
                          <span className="mt-0.5 text-xs text-dim">Sending...</span>
                        ) : (
                          <span role="alert" className="mt-0.5 flex flex-wrap items-center justify-end gap-2 text-xs font-semibold text-amber-text">
                            Not sent: {p.error}
                            <button type="button" onClick={() => retry(p.tempId)} className="min-h-8 px-1 text-accent2 underline underline-offset-4">
                              Retry
                            </button>
                            <button type="button" onClick={() => setPending((l) => l.filter((x) => x.tempId !== p.tempId))} className="min-h-8 px-1 text-dim underline underline-offset-4">
                              Discard
                            </button>
                          </span>
                        )}
                      </li>
                    ),
                  )}
                </ol>
              )}
            </>
          )}
        </div>
        {!noCoach && (
        <form
          aria-label="Send a message"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2 border-t border-border p-3"
        >
          <label htmlFor="client-message" className="sr-only">
            Message to {who}
          </label>
          <textarea
            ref={boxRef}
            id="client-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            onInput={(e) => {
              // Grow with what's typed, up to about five lines.
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
            }}
            aria-describedby="client-message-hint"
            aria-invalid={tooLong || undefined}
            placeholder="Write a message"
            className="min-h-11 flex-1 resize-none overflow-y-auto rounded-lg border border-border bg-surface2 px-3 py-2 text-base text-text"
          />
          <button type="submit" disabled={draft.trim() === "" || tooLong} className="btn btn-primary min-h-11">
            Send
          </button>
        </form>
        )}
        {!noCoach && (
        <p id="client-message-hint" className={`px-3 pb-3 text-xs ${tooLong ? "font-semibold text-amber-text" : "text-dim"}`}>
          {tooLong ? `Messages can be up to ${MAX_CHARS} characters (${draft.trim().length} now).` : "Enter to send, Shift+Enter for a new line."}
        </p>
        )}
      </section>
    </>
  );
}

/** "Today" / "Yesterday" / "Fri, 6 Nov" above the first message of each day (owner, Nov 2026). */
function daySeparator(iso: string): string {
  const d = new Date(iso);
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

function DayLine({ label }: { label: string }) {
  return (
    <li role="presentation" className="flex items-center gap-3 pt-1">
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
      <span className="text-xs font-semibold text-dim">{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden="true" />
    </li>
  );
}

function Bubble({ m, who }: { m: MyMessage; who: string }) {
  const mine = m.sender === "client";
  return (
    <li className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <span className="sr-only">{mine ? "You" : who}:</span>
      <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-card px-3 py-2 text-sm ${mine ? "bg-accent text-on-accent" : "bg-surface2 text-text"}`}>{m.body}</p>
      <span className="mt-0.5 text-xs text-dim">
        {timeOf(m.createdAt)}
        {mine && m.readAt && " · Seen"}
      </span>
    </li>
  );
}
