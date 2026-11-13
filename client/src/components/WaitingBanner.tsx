// Prompt 84: shown above "no clients yet" when people who joined with the code are waiting for approval
// (they aren't in the client list until approved), so the coach can always find them.
import { useQuery } from "@tanstack/react-query";
import { listWaitingClients, queryKeys } from "../api";

export function WaitingBanner({ onOpen }: { onOpen: () => void }) {
  const waiting = useQuery({ queryKey: queryKeys.waitingClients, queryFn: listWaitingClients });
  const n = (waiting.data ?? []).filter((c) => c.joinStatus === "pending").length;
  if (n === 0) return null;
  return (
    <div role="status" className="card mb-4 flex flex-wrap items-center justify-between gap-3 border-accent p-4">
      <p className="text-sm font-semibold text-text">
        {n === 1 ? "1 person is" : `${n} people are`} waiting for you to approve them.
      </p>
      <button type="button" onClick={onOpen} className="btn btn-primary min-h-11">
        Review in Clients
      </button>
    </div>
  );
}
