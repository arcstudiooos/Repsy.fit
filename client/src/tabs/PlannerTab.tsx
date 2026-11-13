import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PlanDetails, inline } from "../components/FormattedText";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAssignment, listAssignments, queryKeys, updateAssignment, updateAssignmentStatus } from "../api";
import { PlanEditor, planProblem, type PlanFields } from "../components/PlanEditor";
import { ManualAssignmentForm, type TemplatePrefill } from "../components/ManualAssignmentForm";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import { MenuButton } from "../components/MenuButton";
import { formatDay } from "../lib/dates";
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
  /** Opens Business > Library's macro calculator pre-filled from this client (the one macro link, next to Nutrition plans). */
  onOpenMacroCalculator?: (clientId: string) => void;
};

type Filter = "All" | AssignmentType;
const FILTERS: Filter[] = ["All", ...ASSIGNMENT_TYPES];

// Plans (the Manual Planner; a sub-tab of the client workspace since Nov 2026): everything assigned to the selected client
// (GET /api/clients/:clientId/assignments, newest first), with instant type filters.
export function PlannerTab({ client, onOpenAiCoach, prefill, onPrefillUsed, onOpenMacroCalculator }: Props) {
  const [filter, setFilter] = useState<Filter>("All");
  // The form reads the template on its first render; after that the parent forgets it, so coming
  // back to this tab later starts from an empty form again.
  const [startFrom] = useState(prefill ?? null);
  // Nov 2026: the New assignment form opens from "+ New plan" (already open for a Library template).
  const [formOpen, setFormOpen] = useState(!!startFrom);
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
    setFormOpen(false);
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
        <p className="text-dim">Nothing assigned yet. Create the first plan with New plan, or ask the AI Coach.</p>
        <button type="button" onClick={onOpenAiCoach} className="btn btn-primary mt-4">
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="page-title">Plans</h2>
        {client && !formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} className="btn btn-primary">
            <span aria-hidden="true">+ </span>New plan
          </button>
        )}
        {client && onOpenMacroCalculator && (
          <button
            type="button"
            onClick={() => onOpenMacroCalculator(client.id)}
            className="min-h-10 text-sm font-semibold text-accent2 underline underline-offset-4 sm:ml-auto"
          >
            <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-type-nutrition" />
            Macro calculator for {client.name}
          </button>
        )}
      </div>
      {client && formOpen && (
        <div className="mt-4">
          <ManualAssignmentForm
            key={client.id}
            clientId={client.id}
            onCreated={onCreated}
            prefill={startFrom}
            onCancel={() => setFormOpen(false)}
          />
        </div>
      )}
      <div className="mt-4">{body}</div>
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
  // Nov 2026: Edit (title, details, why, date) with the same editor as the AI Coach card, saved by PATCH.
  const [editing, setEditing] = useState<PlanFields | null>(null);
  const [editProblem, setEditProblem] = useState<string | null>(null);
  const editMutation = useMutation({
    mutationFn: (plan: PlanFields) =>
      updateAssignment(clientId, assignment.id, {
        title: plan.title.trim(),
        details: plan.details.trim(),
        reasoning: plan.reasoning.trim(),
        date: plan.date,
      }),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });
  const startEdit = () => {
    editMutation.reset();
    setEditProblem(null);
    setEditing({ title: assignment.title, details: assignment.details, reasoning: assignment.reasoning, date: assignment.date });
  };
  const saveEdit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    const problem = planProblem(editing);
    setEditProblem(problem);
    if (!problem) editMutation.mutate(editing);
  };
  const editingNow = editing !== null;
  useEffect(() => {
    // The menu item that opened the editor is gone, so focus moves to the first field.
    if (editingNow) document.getElementById(`edit-${assignment.id}-title`)?.focus();
  }, [editingNow, assignment.id]);
  const busy = statusMutation.isPending || deleteMutation.isPending || editMutation.isPending;
  const error = statusMutation.error ?? deleteMutation.error;
  const isDone = assignment.status === "Done";

  if (editing) {
    const idPrefix = `edit-${assignment.id}`;
    return (
      <li id={`assignment-${assignment.id}`} className="card p-4">
        <form onSubmit={saveEdit} noValidate aria-label={`Edit ${assignment.title}`} className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[assignment.type]}`}>{assignment.type}</span>
            <span className="text-sm text-dim">Editing this plan</span>
          </div>
          <PlanEditor idPrefix={idPrefix} value={editing} onChange={setEditing} withDate />
          {(editProblem || editMutation.isError) && (
            <p role="alert" className="rounded-lg bg-surface2 px-3 py-2 text-sm text-text">
              {editProblem ?? plainErrorMessage(editMutation.error)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={editMutation.isPending}
              className="btn btn-primary"
            >
              {editMutation.isPending ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              disabled={editMutation.isPending}
              onClick={() => setEditing(null)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li id={`assignment-${assignment.id}`} className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[assignment.type]}`}>
          {assignment.type}
        </span>
        <h3 className={"card-title " + (isDone ? "text-dim" : "")}>{assignment.title}</h3>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-dim">
          {assignment.source === "ai" ? "AI" : "Manual"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-dim">
        <span>{formatDay(assignment.date)}</span>
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
        <div className="ml-auto">
          <MenuButton
            label={`More actions for ${assignment.title}`}
            items={[
              { label: "Edit", disabled: busy, onSelect: startEdit },
              {
                label: deleteMutation.isPending ? "Deleting..." : "Delete",
                disabled: busy,
                onSelect: () => {
                  if (window.confirm("Delete this assignment?")) deleteMutation.mutate();
                },
              },
            ]}
          />
        </div>
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
      <div className="mt-2">
        <PlanDetails details={assignment.details} />
      </div>
      {assignment.reasoning.trim() !== "" && <p className="mt-2 text-sm text-dim">Why: {inline(assignment.reasoning)}</p>}
    </li>
  );
}
