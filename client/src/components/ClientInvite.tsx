// Client sign-in invite (Prompt 65), opened from a client card on the Clients tab.
// The coach enters the client's email. With email set up on the server the invite is emailed;
// without it, the coach gets the link to copy and share, with a plain note saying why.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClientAccess, inviteClient, queryKeys } from "../api";
import { InviteSchema } from "../authSchemas";
import { plainErrorMessage } from "./States";
import type { Client, ClientAccess, InviteResult } from "../types";

const STATUS_TEXT: Record<ClientAccess["status"], string> = {
  none: "Not invited yet.",
  invited: "Invited - waiting for them to choose a password.",
  active: "Active - they can sign in.",
};

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export function ClientInvitePanel({ client, onClose }: { client: Client; onClose: () => void }) {
  const queryClient = useQueryClient();
  const access = useQuery({ queryKey: queryKeys.clientAccess(client.id), queryFn: () => getClientAccess(client.id) });
  const [email, setEmail] = useState(client.loginEmail ?? "");
  // Pre-fill with the pending invite's address once the status has loaded (if the coach has not typed).
  const known = access.data?.pendingEmail ?? access.data?.loginEmail ?? null;
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && known && !email) {
    setPrefilled(true);
    setEmail(known);
  }
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useMutation({
    mutationFn: (to: string) => inviteClient(client.id, to),
    onSuccess: (r) => {
      setResult(r);
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.clientAccess(client.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.clients });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = InviteSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0].message);
      return;
    }
    setFieldError(null);
    invite.mutate(parsed.data.email);
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const status = access.data?.status;
  return (
    <section aria-label={`Client sign-in for ${client.name}`} className="card mb-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base">Client sign-in for {client.name}</h3>
          <p className="mt-1 text-sm text-dim">
            {access.isPending ? "Checking..." : status ? STATUS_TEXT[status] : "Couldn't check the sign-in status."}
            {status === "active" && access.data?.loginEmail && ` Signs in as ${access.data.loginEmail}.`}
            {access.data?.pendingEmail && access.data.inviteExpiresAt &&
              ` Invite sent to ${access.data.pendingEmail}; the link works until ${when(access.data.inviteExpiresAt)}.`}
          </p>
        </div>
        <button type="button" onClick={onClose} className="min-h-10 rounded px-2 text-sm text-dim underline-offset-2 hover:text-text hover:underline">
          Close
        </button>
      </div>

      <form onSubmit={submit} noValidate aria-label="Invite client" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <label htmlFor="invite-email" className="mb-1 block text-sm font-bold">
            Client's email
          </label>
          <input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "invite-email-error" : undefined}
            className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text"
          />
        </div>
        <button type="submit" disabled={invite.isPending} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
          {invite.isPending ? "Sending..." : status === "none" || !status ? "Send invite" : "Send a new invite"}
        </button>
      </form>
      {fieldError && (
        <p id="invite-email-error" role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {fieldError}
        </p>
      )}
      {invite.isError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(invite.error)}
        </p>
      )}
      {status === "active" && !result && (
        <p className="mt-2 text-xs text-dim">
          A new invite lets them choose a new password. Nothing changes until they use it; then their old sign-ins end.
        </p>
      )}

      {result?.sent && (
        <p role="status" className="mt-3 text-sm font-semibold text-accent2">
          Invite sent to {result.loginEmail}. The link works once, for 48 hours.
        </p>
      )}
      {result && !result.sent && (
        <div role="status" className="mt-3 rounded-lg border border-border bg-surface2 p-3">
          <p className="text-sm font-semibold text-amber-text">{result.note}</p>
          <label htmlFor="invite-link" className="mt-2 block text-xs font-bold text-dim">
            Invite link for {result.loginEmail} (works once, for 48 hours)
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              id="invite-link"
              readOnly
              value={result.inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 basis-60 rounded-lg border border-border bg-surface px-3 font-mono text-xs text-text"
            />
            <button
              type="button"
              onClick={() => void copy(result.inviteLink)}
              className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text hover:border-dim"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
