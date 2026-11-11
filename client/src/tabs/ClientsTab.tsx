import { Suspense, lazy, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteClient, listAssignments, listClients, queryKeys } from "../api";
import { initials } from "../ClientStrip";
import { AddClientForm } from "../components/AddClientForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DemoSeedError, EmptyState, ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import type { DemoSeed } from "../lib/useDemoSeed";
import type { Client } from "../types";

// The invite panel (Prompt 65) loads on first open, so its form validation (zod) stays out of /app.
const ClientInvitePanel = lazy(() => import("../components/ClientInvite").then((m) => ({ default: m.ClientInvitePanel })));

type Props = {
  selectedClientId: string | null;
  /** Selects the client and switches to the AI Coach tab. */
  onOpenClient: (clientId: string) => void;
  /** Selects a newly added client (stays on the Clients tab). */
  onClientCreated: (clientId: string) => void;
  /** A client was deleted; nextClientId is the client to select if it was the selected one. */
  onClientDeleted: (deletedId: string, nextClientId: string | null) => void;
  seedDemo: DemoSeed;
  seedSixMonth: DemoSeed;
};

// Clients tab: the add-client form plus the full client list as cards, from GET /api/clients.
export function ClientsTab({
  selectedClientId,
  onOpenClient,
  onClientCreated,
  onClientDeleted,
  seedDemo,
  seedSixMonth,
}: Props) {
  const queryClient = useQueryClient();
  const clientsQuery = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });
  const [inviteFor, setInviteFor] = useState<Client | null>(null);
  const [confirmClient, setConfirmClient] = useState<Client | null>(null); // delete confirm box
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});

  const deleteMutation = useMutation({
    mutationFn: (client: Client) => deleteClient(client.id),
    onSuccess: async (_data, client) => {
      // Pick the next remaining client (the one after it, else the one before it).
      const list = queryClient.getQueryData<Client[]>(queryKeys.clients) ?? [];
      const i = list.findIndex((c) => c.id === client.id);
      const next = list[i + 1] ?? list[i - 1] ?? null;
      onClientDeleted(client.id, next?.id ?? null);
      // Drop the deleted client's cached assignments / chat / progress, then refresh every list.
      queryClient.removeQueries({ queryKey: ["clients", client.id] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.clients });
      setConfirmClient(null);
    },
    onError: (error, client) => {
      // Keep the client; show the error inside its card.
      setDeleteErrors((e) => ({ ...e, [client.id]: `Couldn't delete: ${plainErrorMessage(error)}` }));
      setConfirmClient(null);
    },
  });
  const clientCount = clientsQuery.data?.length;
  const [formOpen, setFormOpen] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const openForm = () => {
    setFormOpen(true);
    setFocusSignal((n) => n + 1); // focus Name once the form is on screen
  };

  // The form is open by default when there are zero clients.
  useEffect(() => {
    if (clientCount === 0) setFormOpen(true);
  }, [clientCount]);

  if (clientsQuery.isPending || (clientsQuery.isError && clientsQuery.isFetching)) return <LoadingState />;
  if (clientsQuery.isError) {
    return <ErrorState error={clientsQuery.error} onRetry={() => void clientsQuery.refetch()} />;
  }
  const clients = clientsQuery.data;

  const form = formOpen && (
    <AddClientForm
      focusSignal={focusSignal}
      onCreated={(client) => {
        setFormOpen(false);
        onClientCreated(client.id);
      }}
      onCancel={clients.length > 0 ? () => setFormOpen(false) : undefined}
    />
  );

  if (clients.length === 0) {
    return (
      <>
        <div className="mb-5">
          <EmptyState
            onAddClient={openForm}
            seedDemo={seedDemo}
          />
        </div>
        <SixMonthDemoControl seed={seedSixMonth} />
        {form}
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-2xl">Clients</h2>
          <span className="text-sm text-dim">{clients.length === 1 ? "1 client" : `${clients.length} clients`}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={seedDemo.run}
            disabled={seedDemo.pending}
            className="rounded-lg border border-border bg-surface2 px-4 py-2 text-sm font-semibold text-text hover:border-dim disabled:opacity-60"
          >
            {seedDemo.pending ? "Loading demo..." : (seedDemo.message ?? "Load demo")}
          </button>
          {!formOpen && (
            <button
              type="button"
              onClick={openForm}
              className="btn-primary rounded-lg px-4 py-2 text-sm"
            >
              Add client
            </button>
          )}
        </div>
      </div>
      {/* Prompt 73: the coach is the one who must have permission for the data they type in. */}
      <p className="mb-4 text-sm text-dim">Only add real client data you have permission to store.</p>
      <div className="mb-4 empty:hidden">
        <DemoSeedError seed={seedDemo} />
      </div>
      <SixMonthDemoControl seed={seedSixMonth} />
      {form}
      {inviteFor && (
        <Suspense fallback={<LoadingState />}>
          <ClientInvitePanel key={inviteFor.id} client={inviteFor} onClose={() => setInviteFor(null)} />
        </Suspense>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            selected={client.id === selectedClientId}
            onOpen={() => onOpenClient(client.id)}
            onInvite={() => {
              setInviteFor(client);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onDelete={() => {
              setDeleteErrors(({ [client.id]: _, ...rest }) => rest);
              setConfirmClient(client);
            }}
            deleteError={deleteErrors[client.id]}
          />
        ))}
      </div>
      {confirmClient && (
        <ConfirmDialog
          title={`Delete ${confirmClient.name}?`}
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          pending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(confirmClient)}
          onCancel={() => setConfirmClient(null)}
        >
          Their assignments, chats and progress will also be deleted. This cannot be undone.
        </ConfirmDialog>
      )}
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

type CardProps = {
  client: Client;
  selected: boolean;
  onOpen: () => void;
  /** Opens the client sign-in invite panel (Prompt 65). */
  onInvite: () => void;
  onDelete: () => void;
  deleteError?: string;
};

function ClientCard({ client, selected, onOpen, onInvite, onDelete, deleteError }: CardProps) {
  const counts = useAssignmentCounts(client.id);
  const statLine = stats(client);

  return (
    <div
      className={
        "card relative flex flex-col transition-colors " + (selected ? "border-2 border-accent" : "hover:border-dim")
      }
    >
      {deleteError && (
        <p role="alert" className="mx-4 mt-4 rounded-lg bg-surface2 px-3 py-2 text-sm font-semibold text-amber-text">
          {deleteError}
        </p>
      )}

      {/* Main area: opens the client in AI Coach. */}
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        aria-label={`${client.name} - open in AI Coach`}
        className="flex flex-1 flex-col gap-3 rounded-card p-4 text-left"
      >
        <div className="flex w-full items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface2 font-bold text-text"
          >
            {initials(client.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="break-words font-semibold text-text">{client.name}</div>
            <div className="break-words text-sm text-dim">{client.goal}</div>
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

        {/* pr-36 leaves room for the Sign-in and Delete buttons in the corner. */}
        <div className="mt-auto flex w-full gap-4 border-t border-border pr-36 pt-3 text-sm text-dim">
          <span>
            <span className="font-semibold text-text">{counts.total}</span> assignments
          </span>
          <span>
            <span className="font-semibold text-text">{counts.active}</span> active
          </span>
        </div>
      </button>

      <button
        type="button"
        onClick={onInvite}
        aria-label={`Client sign-in for ${client.name}`}
        className="absolute bottom-4 right-20 rounded px-1 text-sm text-dim underline-offset-2 hover:text-text hover:underline"
      >
        Sign-in
      </button>
      {/* Calm, small text button - not a loud red block. */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${client.name}`}
        className="absolute bottom-4 right-4 rounded px-1 text-sm text-dim underline-offset-2 hover:text-text hover:underline"
      >
        Delete
      </button>
    </div>
  );
}

/**
 * Total and active assignment counts for one client, from the real listAssignments data
 * (same cache as the Manual Planner). Any error shows "-".
 */
function useAssignmentCounts(clientId: string): { total: number | string; active: number | string } {
  const q = useQuery({ queryKey: queryKeys.assignments(clientId), queryFn: () => listAssignments(clientId) });
  if (q.data) return { total: q.data.length, active: q.data.filter((a) => a.status === "Active").length };
  if (q.isError) return { total: "-", active: "-" };
  return { total: 0, active: 0 };
}

/** "Load 6-month demo (10 clients)" plus the note on how the two demo sets add up. */
function SixMonthDemoControl({ seed }: { seed: DemoSeed }) {
  return (
    <div className="mb-5 flex flex-col gap-1">
      <div>
        <button
          type="button"
          onClick={seed.run}
          disabled={seed.pending}
          className="rounded-lg border border-border bg-surface2 px-4 py-2 text-sm font-semibold text-text hover:border-dim disabled:opacity-60"
        >
          {seed.pending ? "Loading 6-month demo..." : (seed.message ?? "Load 6-month demo (10 clients)")}
        </button>
      </div>
      <p className="text-xs text-dim">
        Loading both demo sets gives 13 clients in total, because the names do not overlap. Load the quick demo first: it only loads into an empty client list.
      </p>
      {seed.error && (
        <p role="alert" className="text-sm font-semibold text-accent">
          Couldn't load the 6-month demo: {seed.error}
        </p>
      )}
    </div>
  );
}
