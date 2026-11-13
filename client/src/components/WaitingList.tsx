// "Waiting for approval" (Prompt 84): clients who joined with the code while "Approve new clients" is on.
// Approve -> they're a normal client; Decline -> they see "declined" and can't reach any data. Declined
// people stay listed (so the coach can change their mind by removing them, or they can delete themselves).
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveClient, declineClient, deleteClient, listWaitingClients, queryKeys } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { plainErrorMessage } from "./States";
import type { WaitingClient } from "../types";

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export function WaitingList() {
  const qc = useQueryClient();
  const waiting = useQuery({ queryKey: queryKeys.waitingClients, queryFn: listWaitingClients });
  const [removing, setRemoving] = useState<WaitingClient | null>(null);
  const [declining, setDeclining] = useState<WaitingClient | null>(null);
  const [announce, setAnnounce] = useState("");
  const headingRef = useRef<HTMLDivElement>(null);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.waitingClients }),
      qc.invalidateQueries({ queryKey: queryKeys.clients, exact: true }),
      qc.invalidateQueries({ queryKey: queryKeys.alerts }),
    ]);
  const decide = useMutation({
    mutationFn: ({ id, to }: { id: string; to: "approve" | "decline"; name: string }) => (to === "approve" ? approveClient(id) : declineClient(id)),
    onSuccess: (_r, v) => {
      setDeclining(null);
      setAnnounce(v.to === "approve" ? `Approved ${v.name}. They're in your client list now.` : `Declined ${v.name}.`);
      // The row (and its focused button) is gone: keep focus inside the panel.
      headingRef.current?.focus();
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: async () => {
      setAnnounce(`Removed ${removing?.name ?? "the client"}.`);
      setRemoving(null);
      await refresh();
      headingRef.current?.focus();
    },
  });
  const live = (
    <p aria-live="polite" className="sr-only">
      {announce}
    </p>
  );
  if (waiting.isPending || waiting.isError || waiting.data.length === 0) {
    if (!waiting.isError) return live;
    return waiting.isError ? (
      <p role="alert" className="mt-4 text-sm font-semibold text-amber-text">
        Couldn't load the clients waiting for approval. {plainErrorMessage(waiting.error)}
      </p>
    ) : null;
  }
  const pending = waiting.data.filter((c) => c.joinStatus === "pending");
  const declined = waiting.data.filter((c) => c.joinStatus === "declined");
  return (
    <div ref={headingRef} tabIndex={-1} className="mt-5 border-t border-border pt-4 outline-none">
      {live}
      {pending.length > 0 && (
        <section aria-labelledby="waiting-h">
          <h4 id="waiting-h" className="text-base">
            Waiting for approval ({pending.length})
          </h4>
          <ul aria-label="Waiting for approval" className="mt-2 divide-y divide-border">
            {pending.map((c) => {
              const busy = decide.isPending && decide.variables?.id === c.id;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-text">{c.name}</p>
                    <p className="break-words text-xs text-dim">
                      {c.loginEmail ?? "No email"} · joined with your code {when(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        decide.reset();
                        decide.mutate({ id: c.id, to: "approve", name: c.name });
                      }}
                      aria-label={`Approve ${c.name}`}
                      className="btn btn-primary min-h-11"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        decide.reset();
                        setDeclining(c);
                      }}
                      aria-label={`Decline ${c.name}`}
                      className="btn btn-secondary min-h-11"
                    >
                      Decline
                    </button>
                  </div>
                  {decide.isError && decide.variables?.id === c.id && !declining && (
                    <p role="alert" className="w-full text-sm font-semibold text-amber-text">
                      {plainErrorMessage(decide.error)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {declined.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-dim">Declined ({declined.length})</summary>
          <ul aria-label="Declined" className="divide-y divide-border">
            {declined.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-0 flex-1 break-words text-sm text-text">
                  {c.name} <span className="text-dim">· {c.loginEmail ?? "No email"}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setRemoving(c)}
                  aria-label={`Remove ${c.name}`}
                  className="min-h-11 px-2 text-sm font-semibold text-accent underline underline-offset-4"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {declining && (
        <ConfirmDialog
          title={`Decline ${declining.name}?`}
          confirmLabel="Decline"
          pendingLabel="Declining..."
          pending={decide.isPending}
          onConfirm={() => decide.mutate({ id: declining.id, to: "decline", name: declining.name })}
          onCancel={() => {
            decide.reset();
            setDeclining(null);
          }}
        >
          They'll see that you declined and won't be able to use the app with you. This can't be undone, but you can
          remove them later so they can join again.
          {decide.isError && <span className="mt-2 block font-semibold text-amber-text">{plainErrorMessage(decide.error)}</span>}
        </ConfirmDialog>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          confirmLabel="Remove"
          pendingLabel="Removing..."
          pending={remove.isPending}
          onConfirm={() => remove.mutate(removing.id)}
          onCancel={() => {
            remove.reset();
            setRemoving(null);
          }}
        >
          Their account and anything they entered will be deleted. They can join again with your code later.
          {remove.isError && <span className="mt-2 block font-semibold text-amber-text">{plainErrorMessage(remove.error)}</span>}
        </ConfirmDialog>
      )}
    </div>
  );
}
