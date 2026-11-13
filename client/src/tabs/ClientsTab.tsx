import { Suspense, lazy, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteClient, listClients, queryKeys } from "../api";
import { initials } from "../ClientHeader";
import { AddClientForm } from "../components/AddClientForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MenuButton } from "../components/MenuButton";
import { EmptyState, ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import { daysAgo, formatDay } from "../lib/dates";
import type { DemoSeed } from "../lib/useDemoSeed";
import type { Client } from "../types";

// The invite panel (Prompt 65) loads on first open, so its form validation (zod) stays out of /app.
// Prompt 76: the join-code panel (with the QR encoder) is its own lazy chunk too.
const JoinCodePanel = lazy(() => import("../components/JoinCodePanel").then((m) => ({ default: m.JoinCodePanel })));
const ClientInvitePanel = lazy(() => import("../components/ClientInvite").then((m) => ({ default: m.ClientInvitePanel })));

type Props = {
  selectedClientId: string | null;
  /** Selects the client and opens their workspace (Plans / Progress / Check-ins). */
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
        {/* Prompt 84: people who joined with the code and are waiting for approval aren't in the client list
            yet, so the Invite panel (with the waiting list) must show here too. */}
        <Suspense fallback={<LoadingState />}>
          <JoinCodePanel />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="page-title">Clients</h2>
          <span className="text-sm text-dim">{clients.length === 1 ? "1 client" : `${clients.length} clients`}</span>
        </div>
        {/* The demo-data buttons show only while the client list is empty (owner, Nov 2026). */}
        <div className="flex flex-wrap items-center gap-2">
          {!formOpen && (
            <button
              type="button"
              onClick={openForm}
              className="btn btn-primary"
            >
              Add client
            </button>
          )}
        </div>
      </div>
      {/* Prompt 73: the coach is the one who must have permission for the data they type in. */}
      <p className="mb-4 text-sm text-dim">Only add real client data you have permission to store.</p>
      {form}
      <Suspense fallback={<LoadingState />}>
        <JoinCodePanel />
      </Suspense>
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
  const statLine = stats(client);
  const activity = activityLine(client);

  return (
    // A click anywhere on the card that isn't one of its buttons opens the client too (mouse only;
    // keyboard users have the main button). The action buttons keep their own behaviour.
    <div
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, a, [role=menu]")) onOpen();
      }}
      className={
        "card relative flex cursor-pointer flex-col transition-colors " + (selected ? "border-2 border-accent" : "hover:border-dim")
      }
    >
      {deleteError && (
        <p role="alert" className="mx-4 mt-4 rounded-lg bg-surface2 px-3 py-2 text-sm font-semibold text-amber-text">
          {deleteError}
        </p>
      )}

      {/* Main area (the whole card except its action buttons): opens the client workspace. */}
      <button
        type="button"
        onClick={onOpen}
        aria-pressed={selected}
        aria-label={`Open ${client.name}`}
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
            {client.joinedVia === "code" && (
              <span className="mt-1 inline-block rounded-full border border-accent2 px-2 py-0.5 text-xs font-semibold text-accent2">Joined with code</span>
            )}
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

        {(activity.checkIn || activity.adherence) && (
          <div className="mt-auto flex w-full flex-wrap gap-x-3 border-t border-border pt-3 text-sm text-dim" data-testid="client-activity">
            {activity.checkIn && <span>{activity.checkIn}</span>}
            {activity.adherence && <span className="font-semibold text-text">{activity.adherence}</span>}
          </div>
        )}
      </button>

      <div className="flex items-center justify-end gap-1 px-2 pb-2">
        <button
          type="button"
          onClick={onInvite}
          aria-label={`Client access for ${client.name}`}
          className="min-h-10 rounded px-2 text-sm text-dim underline-offset-2 hover:text-text hover:underline"
        >
          Client access
        </button>
        <MenuButton label={`More actions for ${client.name}`} items={[{ label: "Delete", onSelect: onDelete }]} />
      </div>
    </div>
  );
}

/** "Checked in 3 days ago" / "No check-ins yet", and "Adherence 82%" when there is recent data. */
function activityLine(client: Client): { checkIn: string | null; adherence: string | null } {
  // Undefined = the list did not include these fields (e.g. a client just added): show nothing yet.
  let checkIn: string | null = null;
  if (client.lastCheckIn === null) checkIn = "No check-ins yet";
  else if (client.lastCheckIn) {
    const ago = daysAgo(client.lastCheckIn);
    checkIn = ago ? `Checked in ${ago}` : `Last check-in ${formatDay(client.lastCheckIn)}`;
  }
  const adherence = client.adherence != null ? `Adherence ${client.adherence}%` : null;
  return { checkIn, adherence };
}

/** "Load 6-month demo (10 clients)" - shown only while the client list is empty. */
function SixMonthDemoControl({ seed }: { seed: DemoSeed }) {
  return (
    <div className="mb-5 flex flex-col gap-1">
      <div>
        <button
          type="button"
          onClick={seed.run}
          disabled={seed.pending}
          className="btn btn-secondary"
        >
          {seed.pending ? "Loading 6-month demo..." : (seed.message ?? "Load 6-month demo (10 clients)")}
        </button>
      </div>
      {seed.error && (
        <p role="alert" className="text-sm font-semibold text-accent">
          Couldn't load the 6-month demo: {seed.error}
        </p>
      )}
    </div>
  );
}
