import { useQuery } from "@tanstack/react-query";
import { ApiError, listAssignments, listClients, queryKeys } from "../api";
import { initials } from "../ClientStrip";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import type { Client } from "../types";

type Props = {
  selectedClientId: string | null;
  /** Selects the client and switches to the AI Coach tab. */
  onOpenClient: (clientId: string) => void;
  onAddClient: () => void;
  seedDemo: () => void;
};

// Clients tab: the full client list as cards, from GET /api/clients.
export function ClientsTab({ selectedClientId, onOpenClient, onAddClient, seedDemo }: Props) {
  const clientsQuery = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });

  if (clientsQuery.isPending || (clientsQuery.isError && clientsQuery.isFetching)) return <LoadingState />;
  if (clientsQuery.isError) {
    return <ErrorState error={clientsQuery.error} onRetry={() => void clientsQuery.refetch()} />;
  }
  const clients = clientsQuery.data;
  if (clients.length === 0) return <EmptyState onAddClient={onAddClient} seedDemo={seedDemo} />;

  return (
    <>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-2xl">Clients</h2>
        <span className="text-sm text-dim">{clients.length === 1 ? "1 client" : `${clients.length} clients`}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            selected={client.id === selectedClientId}
            onOpen={() => onOpenClient(client.id)}
          />
        ))}
      </div>
    </>
  );
}

/** "41 yrs · 68.5 kg · 170 cm" - only the values that are present. */
function stats(client: Client): string {
  const parts: string[] = [];
  if (client.age != null) parts.push(`${client.age} yrs`);
  if (client.weightKg != null) parts.push(`${client.weightKg} kg`);
  if (client.heightCm != null) parts.push(`${client.heightCm} cm`);
  return parts.join(" · ");
}

function ClientCard({ client, selected, onOpen }: { client: Client; selected: boolean; onOpen: () => void }) {
  const counts = useAssignmentCounts(client.id);
  const statLine = stats(client);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={selected}
      aria-label={`${client.name} - open in AI Coach`}
      className={
        "card flex flex-col gap-3 p-4 text-left transition-colors " +
        (selected ? "border-2 border-accent" : "hover:border-dim")
      }
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface2 font-bold text-text"
        >
          {initials(client.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-text">{client.name}</div>
          <div className="truncate text-sm text-dim">{client.goal}</div>
        </div>
        <span className="shrink-0 rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-semibold text-text">
          {client.level}
        </span>
      </div>

      {statLine && <div className="text-sm text-text">{statLine}</div>}
      {client.focus && (
        <div className="text-sm text-dim">
          <span className="font-semibold text-text">Focus:</span> {client.focus}
        </div>
      )}

      <div className="mt-auto flex gap-4 border-t border-border pt-3 text-sm text-dim">
        <span>
          <span className="font-semibold text-text">{counts.total}</span> assignments
        </span>
        <span>
          <span className="font-semibold text-text">{counts.active}</span> active
        </span>
      </div>
    </button>
  );
}

/**
 * Total and active assignment counts for one client, from listAssignments.
 * The assignments endpoint arrives in Prompt 19 - until then it is missing, and the
 * counts show 0. Other errors show "-".
 */
function useAssignmentCounts(clientId: string): { total: number | string; active: number | string } {
  const q = useQuery({ queryKey: queryKeys.assignments(clientId), queryFn: () => listAssignments(clientId) });
  if (q.data) return { total: q.data.length, active: q.data.filter((a) => a.status === "Active").length };
  if (q.isError && q.error instanceof ApiError && q.error.kind === "endpoint_missing") return { total: 0, active: 0 };
  if (q.isError) return { total: "-", active: "-" };
  return { total: 0, active: 0 };
}
