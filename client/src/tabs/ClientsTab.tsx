import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteClient, getAtRiskClients, listClients, queryKeys } from "../api";
import { initials } from "../ClientHeader";
import { AddClientForm } from "../components/AddClientForm";
import { NewPlanDialog } from "../components/NewPlanDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MenuButton } from "../components/MenuButton";
import { Modal } from "../components/Modal";
import { WaitingList } from "../components/WaitingList";
import { EmptyState, ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import { PipelineCounts } from "../components/PipelineCounts";
import { daysAgo, formatDay } from "../lib/dates";
import type { DemoSeed } from "../lib/useDemoSeed";
import type { Client } from "../types";
import { useCoachUnits } from "../lib/useCoachUnits";
import { showWeight } from "../lib/snapshotFormat";
import { localToday } from "./AiCoachTab";

// The invite panel (Prompt 65) loads on first open, so its form validation (zod) stays out of /app.
// Prompt 76: the join-code panel (with the QR encoder) is its own lazy chunk too.
const JoinCodePanel = lazy(() => import("../components/JoinCodePanel").then((m) => ({ default: m.JoinCodePanel })));
const ClientInvitePanel = lazy(() => import("../components/ClientInvite").then((m) => ({ default: m.ClientInvitePanel })));

type Props = {
  selectedClientId: string | null;
  /** Selects the client and opens their workspace (Plans / Progress / Check-ins). */
  onOpenClient: (clientId: string) => void;
  /** Selects the client and opens their Messages thread. */
  onMessage: (clientId: string) => void;
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
  onMessage,
  onClientCreated,
  onClientDeleted,
  seedDemo,
  seedSixMonth,
}: Props) {
  const queryClient = useQueryClient();
  const clientsQuery = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });
  const [inviteFor, setInviteFor] = useState<Client | null>(null);
  // Which client a plan is being written for, straight from their card. null = no dialog.
  const [planFor, setPlanFor] = useState<Client | null>(null);
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
      // The Needs-attention panel reads /api/at-risk; without this a just-deleted client lingers there.
      void queryClient.invalidateQueries({ queryKey: ["at-risk"] });
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

  // Nov 2026 redesign (design-roundtable): the roster is the page. Invite config lives behind one
  // "Invite" button; at-risk clients are flagged on their own card and sorted to the top (no separate
  // panel to duplicate them); a search + "Needs attention" filter keeps it usable past a handful.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const atRiskQuery = useQuery({ queryKey: queryKeys.atRisk(localToday()), queryFn: () => getAtRiskClients(localToday()) });
  const atRiskMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of atRiskQuery.data?.clients ?? []) m.set(c.clientId, c.reasons.map((r) => r.text));
    return m;
  }, [atRiskQuery.data]);
  const attentionCount = atRiskMap.size;
  const visibleClients = useMemo(() => {
    const all = clientsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    let list = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.goal.toLowerCase().includes(q)) : all;
    if (filter === "attention") list = list.filter((c) => atRiskMap.has(c.id));
    // At-risk first, then alphabetical; "who needs me" is the natural reading order, not A-Z.
    return [...list].sort((a, b) => {
      const ra = atRiskMap.has(a.id) ? 0 : 1;
      const rb = atRiskMap.has(b.id) ? 0 : 1;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });
  }, [clientsQuery.data, search, filter, atRiskMap]);

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
        {/* People who joined with the code and are waiting for approval aren't in the client list yet,
            so the join-code panel and the waiting list must show here too. */}
        <WaitingList />
        <Suspense fallback={<LoadingState />}>
          <JoinCodePanel />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title">Clients</h2>
          <PipelineCounts activeCount={clients.length} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!formOpen && (
            <button type="button" onClick={openForm} className="btn btn-primary">
              Add client
            </button>
          )}
          {/* Invite is set-once config: one button, a modal away - it no longer owns the top of the page. */}
          <button type="button" onClick={() => setInviteOpen(true)} className="btn btn-secondary">
            Invite
          </button>
        </div>
      </div>
      {/* Prompt 73: consent note shown where it's relevant - while the add form is open. */}
      {formOpen && <p className="mb-3 text-sm text-dim">Only add real client data you have permission to store.</p>}
      {form}
      {/* Waiting-for-approval: its own strip, and only when someone is actually waiting (self-hides). */}
      <WaitingList />

      {/* Find a client, or narrow to just the ones who need attention. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Search clients</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients"
            className="min-h-11 w-full rounded-lg border border-border-strong bg-surface2 px-3 text-sm text-text placeholder:text-dim"
          />
        </label>
        <div role="group" aria-label="Filter clients" className="flex gap-1">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterChip>
          <FilterChip active={filter === "attention"} onClick={() => setFilter("attention")} disabled={attentionCount === 0}>
            {attentionCount > 0 ? `Needs attention (${attentionCount})` : "Needs attention"}
          </FilterChip>
        </div>
      </div>

      {inviteOpen && (
        <Modal title="Invite clients" description="Share your code or link so clients can join you." size="lg" onRequestClose={() => setInviteOpen(false)}>
          <Suspense fallback={<LoadingState />}>
            <JoinCodePanel embedded />
          </Suspense>
        </Modal>
      )}
      {planFor && (
        <NewPlanDialog client={{ id: planFor.id, name: planFor.name }} onClose={() => setPlanFor(null)} />
      )}

      {inviteFor && (
        <Suspense fallback={<LoadingState />}>
          <ClientInvitePanel key={inviteFor.id} client={inviteFor} onClose={() => setInviteFor(null)} />
        </Suspense>
      )}
      {visibleClients.length === 0 ? (
        <p className="empty-state py-8 text-center">
          {filter === "attention" ? "Everyone is on track right now." : "No clients match your search."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleClients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              selected={client.id === selectedClientId}
              atRiskReasons={atRiskMap.get(client.id)}
              onOpen={() => onOpenClient(client.id)}
              onMessage={() => onMessage(client.id)}
              // No scrollTo any more: the invite opens as a dialog over the roster, so the page
              // does not move and the client card the coach clicked is still behind it.
              onInvite={() => setInviteFor(client)}
              onDelete={() => {
                setDeleteErrors(({ [client.id]: _, ...rest }) => rest);
                setConfirmClient(client);
              }}
              onNewPlan={() => setPlanFor(client)}
              deleteError={deleteErrors[client.id]}
            />
          ))}
        </div>
      )}
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

/** A pill toggle for the roster filter (All / Needs attention). Selection reads via aria-pressed. */
function FilterChip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`min-h-11 rounded-full border bg-surface2 px-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
        active ? "border-transparent text-text ring-2 ring-accent2" : "border-border-strong text-dim hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

/** "41 yrs · 68.5 kg · 170 cm" - only the values that are present, in the coach's own unit. */
function stats(client: Client, units: "kg" | "lb"): string {
  const parts: string[] = [];
  if (client.age != null) parts.push(`${client.age} yrs`);
  if (client.weightKg != null) parts.push(showWeight(client.weightKg, units));
  if (client.heightCm != null) parts.push(`${client.heightCm} cm`);
  return parts.join(" · ");
}

type CardProps = {
  client: Client;
  selected: boolean;
  /** At-risk reason lines (rules only); present = this client is flagged. */
  atRiskReasons?: string[];
  onOpen: () => void;
  /** Opens that client's Messages thread. */
  onMessage: () => void;
  /** Opens the client sign-in invite panel (Prompt 65). */
  onInvite: () => void;
  onDelete: () => void;
  onNewPlan: () => void;
  deleteError?: string;
};

function ClientCard({ client, selected, atRiskReasons, onOpen, onMessage, onInvite, onDelete, onNewPlan, deleteError }: CardProps) {
  const statLine = stats(client, useCoachUnits());
  const activity = activityLine(client);
  const atRisk = (atRiskReasons?.length ?? 0) > 0;
  const adherence = client.adherence;

  return (
    // A click anywhere on the card that isn't one of its buttons opens the client too (mouse only;
    // keyboard users have the main button). The action buttons keep their own behaviour.
    <div
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, a, [role=menu]")) onOpen();
      }}
      className={
        "card relative flex cursor-pointer flex-col transition-colors " +
        (atRisk ? "border-l-4 border-l-amber " : "") +
        (selected ? "ring-2 ring-accent" : "hover:border-dim")
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
        <div className="flex w-full items-start gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface2 font-bold text-text">
            {initials(client.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="break-words font-semibold text-text">{client.name}</div>
            <div className="break-words text-sm text-dim">{client.goal}</div>
            {client.joinedVia === "code" && (
              <span className="mt-1 inline-block rounded-full bg-surface2 px-2 py-0.5 text-xs font-semibold text-dim">Joined with code</span>
            )}
          </div>
          {/* At-risk and level read as neutral chips with coloured text - accent orange is reserved
              for actions, never decoration, so health is signalled by amber + the bar below. */}
          <div className="flex shrink-0 flex-col items-end gap-1">
            {atRisk && <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-bold text-amber-text">Needs attention</span>}
            <span className="rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-semibold text-dim">{client.level}</span>
          </div>
        </div>

        {statLine && <div className="text-sm tabular-nums text-text">{statLine}</div>}
        {client.focus && (
          <div className="text-sm text-dim">
            <span className="font-semibold text-text">Focus:</span> {client.focus}
          </div>
        )}

        {atRisk && (
          <ul className="flex w-full flex-col gap-0.5">
            {atRiskReasons!.map((reason, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-amber-text">
                <span aria-hidden="true">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Status zone: adherence as a track, so health reads by shape + colour, not just a number. */}
        <div className="mt-auto w-full border-t border-border pt-3" data-testid="client-activity">
          {adherence != null ? (
            <>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-dim">{activity.checkIn ?? "Adherence"}</span>
                <span className={`font-semibold tabular-nums ${atRisk ? "text-amber-text" : "text-text"}`}>{adherence}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface2" role="img" aria-label={`Adherence ${adherence}%`}>
                <div className={`h-full rounded-full ${atRisk ? "bg-amber" : "bg-accent2"}`} style={{ width: `${Math.max(0, Math.min(100, adherence))}%` }} />
              </div>
            </>
          ) : (
            <span className="text-sm text-dim">{activity.checkIn ?? "No check-ins yet"}</span>
          )}
        </div>
      </button>

      {/* One visible primary (Message - the thing a coach does most), everything else in the menu. */}
      <div className="flex items-center justify-between gap-1 px-2 pb-2">
        <button type="button" onClick={onMessage} aria-label={`Message ${client.name}`} className="btn btn-ghost">
          Message
        </button>
        <MenuButton
          label={`More actions for ${client.name}`}
          items={[
            { label: "New plan", onSelect: onNewPlan },
            { label: "Client access", onSelect: onInvite },
            { label: "Delete", onSelect: onDelete },
          ]}
        />
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
