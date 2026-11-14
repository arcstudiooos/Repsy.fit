// The one line a coach sees about their plan without going looking for it (Nov 2026).
//
// Shown only when there is something worth saying: days left near the end of a trial, a failed
// payment, or a lapsed plan. On a healthy paid account it renders nothing at all - a permanent
// billing banner is just noise a coach learns to ignore.
import { useQuery } from "@tanstack/react-query";
import { getBilling, queryKeys } from "../api";
import { navigate } from "../route";

/** Days left at which a trial starts being mentioned. Earlier than this it is just pestering. */
const NAG_FROM = 4;

export function BillingBanner() {
  const { data } = useQuery({ queryKey: queryKeys.billing, queryFn: getBilling, staleTime: 60_000 });
  if (!data || !data.message) return null;
  const quiet = data.status === "trialing" && (data.daysLeft ?? 99) > NAG_FROM;
  if (quiet) return null;

  const urgent = !data.canWrite || data.status === "past_due";
  return (
    <div
      data-testid="billing-banner"
      role={urgent ? "alert" : undefined}
      className={`mt-4 flex flex-wrap items-center gap-3 rounded-card border px-4 py-3 text-sm ${
        urgent ? "border-amber bg-surface2 font-semibold text-amber-text" : "border-border bg-surface2 text-dim"
      }`}
    >
      <span>{data.message}</span>
      <button
        type="button"
        className="btn btn-secondary ml-auto min-h-10"
        onClick={() => navigate("/app/account")}
      >
        {data.needsSubscription ? "Choose a plan" : "Open billing"}
      </button>
    </div>
  );
}
