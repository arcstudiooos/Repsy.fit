import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAssignment, listAssignments, queryKeys, updateAssignmentStatus } from "../api";
import { ManualAssignmentForm, type TemplatePrefill } from "../components/ManualAssignmentForm";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  type Assignment,
  type AssignmentStatus,
  type AssignmentType,
  type Client,
} from "../types";
import { TYPE_CHIP } from "./AiCoachTab";

type Props = {
  client: Client | null;
  onOpenAiCoach: () => void;
  /** Prompt 58: a Library template to start the new-assignment form from (read once, when the tab opens). */
  prefill?: TemplatePrefill | null;
  onPrefillUsed?: () => void;
};

type Filter = "All" | AssignmentType;
const FILTERS: Filter[] = ["All", ...ASSIGNMENT_TYPES];

// Manual Planner tab: everything assigned to the selected client
// (GET /api/clients/:clientId/assignments, newest first), with instant type filters.
export function PlannerTab({ client, onOpenAiCoach, prefill, onPrefillUsed }: Props) {
  const [filter, setFilter] = useState<Filter>("All");
  // The form reads the template on its first render; after that the parent forgets it, so coming
  // back to this tab later starts from an empty form again.
  const [startFrom] = useState(prefill ?? null);
  useEffect(() => {
    if (startFrom) onPrefillUsed?.();
  }, [startFrom, onPrefillUsed]);

  const assignmentsQuery = useQuery({
    queryKey: queryKeys.assignments(client?.id ?? "none"),
    queryFn: () => listAssignments(client!.id),
    enabled: !!client,
  });

  const all = assignmentsQuery.data ?? [];
  // Client-side only: the list is already loaded, so filtering never refetches.
  const shown = filter === "All" ? all : all.filter((a) => a.type === filter);

  // After a manual create: scroll to the new card once the refreshed list has rendered it.
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollToId) return;
    const card = document.getElementById(`assignment-${scrollToId}`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollToId(null);
  }, [scrollToId, shown]);

  const onCreated = (saved: Assignment) => {
    // A filter that hides the new plan's type would hide the card too.
    if (filter !== "All" && filter !== saved.type) setFilter("All");
    setScrollToId(saved.id);
  };

  let body: ReactNode;
  if (!client) {
    body = null;
  } else if (assignmentsQuery.isPending || (assignmentsQuery.isError && assignmentsQuery.isFetching)) {
    body = <LoadingState />;
  } else if (assignmentsQuery.isError) {
    body = <ErrorState error={assignmentsQuery.error} onRetry={() => void assignmentsQuery.refetch()} />;
  } else if (all.length === 0) {
    body = (
      <div className="rounded-card bg-surface2 px-4 py-6 text-center">
        <p className="text-dim">Nothing assigned yet. Create the first plan below, or ask the AI Coach.</p>
        <button type="button" onClick={onOpenAiCoach} className="btn-primary mt-4 rounded-lg px-4 py-2 text-sm">
          Ask the AI Coach
        </button>
      </div>
    );
  } else {
    body = (
      <>
        <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const isActive = f === filter;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilter(f)}
                className={
                  "rounded-full border px-3 py-1.5 text-sm font-semibold " +
                  (isActive ? "border-accent bg-accent font-bold text-on-accent" : "border-border bg-surface2 text-text hover:border-dim")
                }
              >
                {f}
              </button>
            );
          })}
        </div>
        {shown.length === 0 ? (
          <p className="mt-4 rounded-card bg-surface2 px-4 py-6 text-center text-dim">
            No {filter} assignments for this client.
          </p>
        ) : (
          <ul aria-label="Assignments" className="mt-4 flex flex-col gap-3">
            {shown.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <>
      <h2 className="text-2xl">Manual Planner</h2>
      <p className="mt-1 text-sm text-dim">Selected: {client ? client.name : "none"}</p>
      <div className="mt-4">{body}</div>
      {client && <ManualAssignmentForm key={client.id} clientId={client.id} onCreated={onCreated} prefill={startFrom} />}
    </>
  );
}

function AssignmentCard({ assignment }: { assignment: Assignment }) {
  const queryClient = useQueryClient();
  const { clientId } = assignment;
  // The list, the Clients tab counts (same assignments cache) and Progress completion numbers.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments(clientId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.progress(clientId) }),
    ]);

  const statusMutation = useMutation({
    mutationFn: (status: AssignmentStatus) => updateAssignmentStatus(clientId, assignment.id, status),
    onSuccess: refresh,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteAssignment(clientId, assignment.id),
    onSuccess: refresh,
  });
  const busy = statusMutation.isPending || deleteMutation.isPending;
  const error = statusMutation.error ?? deleteMutation.error;
  const isDone = assignment.status === "Done";

  return (
    <li id={`assignment-${assignment.id}`} className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[assignment.type]}`}>
          {assignment.type}
        </span>
        <h3 className={"text-lg " + (isDone ? "text-dim" : "")}>{assignment.title}</h3>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-dim">
          {assignment.source === "ai" ? "AI" : "Manual"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-dim">
        <span>{assignment.date}</span>
        <div role="group" aria-label="Status" className="flex items-center gap-1">
          {isDone && (
            <span title="Done" className="mr-1 font-bold text-accent2">
              ✓
            </span>
          )}
          {ASSIGNMENT_STATUSES.map((s) => {
            const isCurrent = s === assignment.status;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={isCurrent}
                disabled={busy}
                onClick={() => !isCurrent && statusMutation.mutate(s)}
                className={
                  "rounded-lg border px-2 py-0.5 text-xs font-semibold disabled:cursor-not-allowed " +
                  (isCurrent ? "border-text bg-surface2 font-bold text-text" : "border-border text-dim hover:border-dim hover:text-text")
                }
              >
                {s}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Delete this assignment?")) deleteMutation.mutate();
          }}
          className="ml-auto rounded px-1 text-sm text-dim underline-offset-2 hover:text-text hover:underline disabled:opacity-60"
        >
          {deleteMutation.isPending ? "Deleting..." : "Delete"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-accent">
          {plainErrorMessage(error)}
        </p>
      )}
      {/* Prompt 79: the client finished it themselves, from their app. */}
      {isDone && assignment.completedBy === "client" && (
        <div className="mt-2 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm">
          <p className="font-semibold text-accent2">
            Done by client
            {assignment.clientEffort != null && <span className="font-normal text-text"> · Effort {assignment.clientEffort}/10</span>}
          </p>
          {assignment.clientNote && <p className="mt-1 whitespace-pre-wrap text-text">“{assignment.clientNote}”</p>}
        </div>
      )}
      <p className="mt-2 whitespace-pre-wrap text-sm text-text">{assignment.details}</p>
      {assignment.reasoning.trim() !== "" && <p className="mt-2 text-sm text-dim">Why: {assignment.reasoning}</p>}
    </li>
  );
}
