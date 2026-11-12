import { useEffect, useState } from "react";
import { WaitingList } from "./WaitingList";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJoinCode, queryKeys, regenerateJoinCode, updateJoinCode } from "../api";
import type { JoinCode } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { plainErrorMessage } from "./States";
import { QrCode } from "./QrCode";

// Prompt 76: the coach's one join code. Clients open the link (or type the code) to sign up under
// this coach. Lazy-loaded with the Clients tab's invite pieces so the QR encoder stays out of /app.
export function JoinCodePanel() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.joinCode, queryFn: getJoinCode });
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const [confirmNew, setConfirmNew] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const store = (data: JoinCode) => queryClient.setQueryData(queryKeys.joinCode, data);
  // Only the latest action's error shows (an old switch error never hides a newer regenerate error).
  const [actionError, setActionError] = useState<unknown>(null);
  const update = useMutation({
    mutationFn: updateJoinCode,
    onMutate: () => setActionError(null),
    onSuccess: store,
    onError: (e) => setActionError(e),
  });
  const regenerate = useMutation({
    mutationFn: regenerateJoinCode,
    onMutate: () => setActionError(null),
    onSuccess: (data) => {
      store(data);
      setCopied(null);
      setConfirmNew(false);
    },
    onError: (e) => {
      setActionError(e);
      setConfirmNew(false);
    },
  });


  async function copy(what: "code" | "link", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setCopyFailed(false);
    } catch {
      setCopied(null);
      setCopyFailed(true);
    }
  }
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  async function share(link: string) {
    try {
      await navigator.share({ title: "Join my coaching on Repsy", text: "Join my coaching on Repsy", url: link });
    } catch {
      // The coach closed the share sheet - nothing to do.
    }
  }

  if (query.isPending) {
    return (
      <section aria-label="Invite clients" className="card mb-4 p-5" aria-busy="true">
        <p className="text-sm text-dim">Loading your join code...</p>
      </section>
    );
  }
  if (query.isError || typeof query.data?.code !== "string") {
    return (
      <section aria-label="Invite clients" className="card mb-4 p-5">
        <p role="alert" className="text-sm font-semibold text-amber-text">
          Couldn't load your join code{query.error ? `: ${plainErrorMessage(query.error)}` : "."}
        </p>
        <button type="button" onClick={() => void query.refetch()} className="mt-2 min-h-11 rounded-lg border border-border bg-surface2 px-4 text-sm font-semibold text-text hover:border-dim">
          Retry
        </button>
      </section>
    );
  }
  const jc = query.data;
  const off = !jc.active;
  const buttonClass =
    "min-h-11 rounded-lg border border-border bg-surface2 px-4 text-sm font-semibold text-text hover:border-dim disabled:opacity-60";

  return (
    <section aria-label="Invite clients" className="card mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-72">
          <h3 className="text-base">Invite clients</h3>
          <p className="mt-1 text-sm text-dim">
            Share your code or link. Clients who sign up with it join you as their coach.
          </p>
          <p className={`mt-3 font-mono text-3xl font-bold tracking-wider ${off ? "text-dim line-through" : "text-text"}`} data-testid="join-code">
            {jc.code}
          </p>
          {off && (
            <p role="status" className="mt-1 text-sm font-semibold text-amber-text">
              Your code is turned off. Nobody can join with it until you turn it back on.
            </p>
          )}
          <label htmlFor="join-link" className="mt-3 block text-xs font-bold text-dim">
            Join link
          </label>
          <input
            id="join-link"
            readOnly
            value={jc.link}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-surface px-3 font-mono text-xs text-text"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => void copy("code", jc.code)}>
              {copied === "code" ? "Copied" : "Copy code"}
            </button>
            <button type="button" className={buttonClass} onClick={() => void copy("link", jc.link)}>
              {copied === "link" ? "Copied" : "Copy link"}
            </button>
            {canShare && (
              <button type="button" className={buttonClass} onClick={() => void share(jc.link)}>
                Share
              </button>
            )}
            <button type="button" className={`${buttonClass} sm:hidden`} aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
              {showQr ? "Hide QR code" : "Show QR code"}
            </button>
          </div>
          {copyFailed && (
            <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
              Couldn't copy. Select the link above and copy it yourself.
            </p>
          )}
        </div>
        <figure className={`${showQr ? "block" : "hidden"} sm:block`}>
          <QrCode text={jc.link} label={`QR code for your join link ${jc.link}`} />
          <figcaption className="mt-1 text-center text-xs text-dim">Scan to join</figcaption>
        </figure>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        <Toggle
          id="join-active"
          label="Code is on"
          hint="Turn it off to stop new sign-ups. Clients who already joined are not affected."
          checked={jc.active}
          pending={update.isPending}
          onChange={(v) => update.mutate({ active: v })}
        />
        <Toggle
          id="join-approve"
          label="Approve new clients before they join"
          hint="When on, people who sign up with your code wait in a list until you approve them."
          checked={jc.approveNewClients}
          pending={update.isPending}
          onChange={(v) => update.mutate({ approveNewClients: v })}
        />
        <div>
          <button type="button" className={buttonClass} disabled={regenerate.isPending} onClick={() => setConfirmNew(true)}>
            {regenerate.isPending ? "Making a new code..." : "Make a new code"}
          </button>
        </div>
        {actionError != null && (
          <p role="alert" className="text-sm font-semibold text-amber-text">
            {plainErrorMessage(actionError)}
          </p>
        )}
      </div>

      {confirmNew && (
        <ConfirmDialog
          title="Make a new join code?"
          confirmLabel="Make new code"
          pendingLabel="Making..."
          pending={regenerate.isPending}
          onConfirm={() => regenerate.mutate()}
          onCancel={() => setConfirmNew(false)}
        >
          Your current code and link ({jc.code}) will stop working straight away. Clients who already joined are not affected.
        </ConfirmDialog>
      )}
      {/* Prompt 84: clients waiting for approval, with Approve / Decline. */}
      <WaitingList />
    </section>
  );
}

function Toggle(props: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        id={props.id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-describedby={`${props.id}-hint`}
        disabled={props.pending}
        onClick={() => props.onChange(!props.checked)}
        className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-border transition-colors disabled:opacity-60 ${
          props.checked ? "bg-accent" : "bg-surface2"
        }`}
      >
        <span className="sr-only">{props.label}</span>
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform motion-reduce:transition-none ${
            props.checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <div>
        <label htmlFor={props.id} className="text-sm font-semibold text-text">
          {props.label}
        </label>
        <p id={`${props.id}-hint`} className="text-xs text-dim">
          {props.hint}
        </p>
      </div>
    </div>
  );
}
