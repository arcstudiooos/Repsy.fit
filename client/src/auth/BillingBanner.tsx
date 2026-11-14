// The one line a coach sees about their plan without going looking for it (owner, Nov 2026).
//
// It speaks only when there is something to act on: a roster that is full, or a payment that
// failed. On a healthy plan - free or paid - it renders nothing at all. There is no trial counting
// down any more, so there is nothing to nag about, and a permanent billing banner is just noise a
// coach learns to ignore.
import { useQuery } from "@tanstack/react-query";
import { getBilling, queryKeys } from "../api";
import { navigate } from "../route";

export function BillingBanner() {
  const { data } = useQuery({ queryKey: queryKeys.billing, queryFn: getBilling, staleTime: 60_000 });
  if (!data) return null;

  const full = data.clientsUsed >= data.clientLimit;
  const failing = data.status === "past_due";
  if (!full && !failing) return null;

  const text = failing
    ? (data.message ?? "Your last payment did not go through.")
    : data.isFree
      ? `You are coaching ${data.clientsUsed} of ${data.clientLimit} clients on the free plan. Move up a plan to add more.`
      : `You are at ${data.clientsUsed} of ${data.clientLimit} clients. Move up a plan to add more.`;

  return (
    <div
      data-testid="billing-banner"
      role={failing ? "alert" : undefined}
      className={`mt-4 flex flex-wrap items-center gap-3 rounded-card border px-4 py-3 text-sm ${
        failing ? "border-amber bg-surface2 font-semibold text-amber-text" : "border-border bg-surface2 text-dim"
      }`}
    >
      <span>{text}</span>
      <button type="button" className="btn btn-secondary ml-auto min-h-10" onClick={() => navigate("/app/account")}>
        {failing ? "Open billing" : "See plans"}
      </button>
    </div>
  );
}
