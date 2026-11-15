// How many clients, waiting and leads (Inspo C6, Nov 2026).
//
// WHAT THIS DELIBERATELY IS NOT: the competitor's four-tab pipeline (Active / Pending / Archive /
// Leads). Repsy already shows the waiting list directly below this heading and keeps leads in
// Business, so a parallel tabbed list would mean two places showing the same rows - two surfaces to
// look at, two to maintain, and a coach unsure which one is the truth.
//
// What was genuinely missing is the COUNT: knowing something is waiting without scrolling. So this
// is one quiet line, and each number says where to go rather than pretending to be a destination.
import { useQuery } from "@tanstack/react-query";
import { listWaitingClients, queryKeys } from "../api";

export function PipelineCounts({ activeCount }: { activeCount: number }) {
  // Waiting clients only. Leads are a Business concern and are not refetched here just for a badge.
  const waiting = useQuery({ queryKey: queryKeys.waitingClients, queryFn: listWaitingClients });
  const pending = (waiting.data ?? []).filter((c) => c.joinStatus === "pending").length;

  return (
    <p className="text-sm text-dim">
      <span>{activeCount === 1 ? "1 client" : `${activeCount} clients`}</span>
      {/* Shown only when there IS something waiting: a permanent "0 waiting" is noise. */}
      {pending > 0 && (
        <span className="font-semibold text-text">
          {" · "}
          {pending === 1 ? "1 waiting to be approved" : `${pending} waiting to be approved`}
        </span>
      )}
    </p>
  );
}
