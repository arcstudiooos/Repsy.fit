import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PlanDetails, inline } from "../components/FormattedText";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAssignment, listAssignments, queryKeys, repeatWeek, updateAssignment, updateAssignmentStatus } from "../api";
import { PlanEditor, planProblem, type PlanFields } from "../components/PlanEditor";
import { WorkoutBuilder } from "../components/WorkoutBuilder";
import { PlanGrid } from "../components/PlanGrid";
import { weekStartOf } from "../lib/schedule";
import { ManualAssignmentForm, type TemplatePrefill } from "../components/ManualAssignmentForm";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import { MenuButton } from "../components/MenuButton";
import { formatDay } from "../lib/dates";
import { useCoachUnits } from "../lib/useCoachUnits";
import { showWeight } from "../lib/snapshotFormat";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  type Assignment,
  type AssignmentStatus,
  type AssignmentType,
  type Client,
} from "../types";
import { TYPE_CHIP, localToday } from "./AiCoachTab";

type Props = {
  client: Client | null;
  onOpenAiCoach: () => void;
  /** Prompt 58: a Library template to start the new-assignment form from (read once, when the tab opens). */
  prefill?: TemplatePrefill | null;
  onPrefillUsed?: () => void;
  /** Opens Business > Library's macro calculator pre-filled from this client (the one macro link, next to Nutrition plans). */
  onOpenMacroCalculator?: (clientId: string) => void;
  /** Inspo W13: reopen the structured builder on this assignment (from the unsaved-changes banner). */
  resumeBuildId?: string | null;
  onResumeBuildUsed?: () => void;
  /** Builds the "Continue editing" action for a draft: App navigates back here, then reopens it. */
  onRegisterBuildResume?: (clientId: string, assignmentId: string) => () => void;
};

type Filter = "All" | AssignmentType;
const FILTERS: Filter[] = ["All", ...ASSIGNMENT_TYPES];

/** The Monday of the current local week as "YYYY-MM-DD" (the target week for Repeat last week). */
function mondayOfThisWeek(): string {
  return weekStartOf(new Date()).toLocaleDateString("en-CA");
}

// Plans (the Manual Planner; a sub-tab of the client workspace since Nov 2026): everything assigned to the selected client
// (GET /api/clients/:clientId/assignments, newest first), with instant type filters.
export function PlannerTab({
  client,
  onOpenAiCoach,
  prefill,
  onPrefillUsed,
  onOpenMacroCalculator,
  resumeBuildId = null,
  onResumeBuildUsed,
  onRegisterBuildResume,
}: Props) {
  const [filter, setFilter] = useState<Filter>("All");
  // The form reads the template on its first render; after that the parent forgets it, so coming
  // back to this tab later starts from an empty form again.
  const [startFrom] = useState(prefill ?? null);
  // Nov 2026: the New assignment form opens from "+ New plan" (already open for a Library template).
  const [formOpen, setFormOpen] = useState(!!startFrom);
  // Inspo W11: List or Calendar. The list stays the default - it is what a coach opens Plans for -
  // and the calendar is for seeing a block, and its gaps, at once.
  const [view, setView] = useState<"List" | "Calendar">("List");
  // A date clicked in the grid, used once to pre-fill the new-plan form.
  const [dateFromGrid, setDateFromGrid] = useState<string | null>(null);
  useEffect(() => {
    if (startFrom) onPrefillUsed?.();
  }, [startFrom, onPrefillUsed]);

  const assignmentsQuery = useQuery({
    queryKey: queryKeys.assignments(client?.id ?? "none"),
    queryFn: () => listAssignments(client!.id),
    enabled: !!client,
  });

  const queryClient = useQueryClient();
  // Repeat last week: clone the previous calendar week's plans into this week (dates +7 days).
  const repeat = useMutation({
    mutationFn: () => repeatWeek(client!.id, mondayOfThisWeek()),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assignments(client!.id) });
      window.alert(result.created === 0 ? "No plans in last week to repeat." : `Copied ${result.created} plan${result.created === 1 ? "" : "s"} into this week.`);
    },
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
    // Nov 2026: the new card scrolls into view with its "Build sets and reps" button already
    // visible, so the structured builder is one obvious click away. We deliberately do NOT force it
    // open: a coach who just set sets and reps in the inline exercise picker has already done that
    // depth, and dropping them into a second builder every time would hide the plan they just made
    // and fight the common case. Depth is offered, not imposed.
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
        {/* Inspo W11: List is the default; Calendar is for seeing a block, and its gaps, at once. */}
        <div role="group" aria-label="Plans view" className="mb-3 flex flex-wrap gap-2">
          {(["List", "Calendar"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={
                "min-h-10 rounded-full border px-4 text-sm font-semibold " +
                (view === v ? "border-text bg-text text-bg" : "border-border-strong bg-surface2 text-text hover:border-dim")
              }
            >
              {v}
            </button>
          ))}
        </div>
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
                  (isActive ? "border-accent bg-accent font-bold text-on-accent" : "border-border-strong bg-surface2 text-text hover:border-dim")
                }
              >
                {f}
              </button>
            );
          })}
        </div>
        {view === "Calendar" ? (
          <PlanGrid
            assignments={shown}
            today={localToday()}
            onOpen={(id) => {
              // Back to the list, where the card can actually be read and acted on.
              setView("List");
              // The card has id="assignment-<id>", set when the list renders.
              requestAnimationFrame(() => document.getElementById(`assignment-${id}`)?.scrollIntoView({ block: "center" }));
            }}
            onAdd={(date) => {
              setDateFromGrid(date);
              setFormOpen(true);
              setView("List");
            }}
          />
        ) : shown.length === 0 ? (
          <p className="mt-4 rounded-card bg-surface2 px-4 py-6 text-center text-dim">
            No {filter} assignments for this client.
          </p>
        ) : (
          <ul aria-label="Assignments" className="mt-4 flex flex-col gap-3">
            {shown.map((a) => (
              <AssignmentCard
                  key={a.id}
                  assignment={a}
                  openBuilder={resumeBuildId === a.id}
                  onBuilderOpened={onResumeBuildUsed}
                  registerResume={onRegisterBuildResume}
                />
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
        {client && (
          <button
            type="button"
            disabled={repeat.isPending}
            onClick={() => {
              if (window.confirm("Copy last week's plans into this week? Each plan's date moves forward 7 days.")) repeat.mutate();
            }}
            className="btn btn-secondary"
          >
            {repeat.isPending ? "Repeating..." : "Repeat last week"}
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
            // The date is in the key so picking a different day in the grid reopens the form on it.
            key={`${client.id}:${dateFromGrid ?? ""}`}
            clientId={client.id}
            onCreated={onCreated}
            prefill={startFrom}
            startDate={dateFromGrid ?? undefined}
            onCancel={() => {
              setFormOpen(false);
              setDateFromGrid(null);
            }}
          />
        </div>
      )}
      <div className="mt-4">{body}</div>
    </>
  );
}

function AssignmentCard({
  assignment,
  openBuilder = false,
  onBuilderOpened,
  registerResume,
}: {
  assignment: Assignment;
  /** Open the structured builder straight away (the unsaved-changes banner sent us back here). */
  openBuilder?: boolean;
  onBuilderOpened?: () => void;
  registerResume?: (clientId: string, assignmentId: string) => () => void;
}) {
  const queryClient = useQueryClient();
  const units = useCoachUnits();
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
  // Inspo W3: the structured builder, open on this plan. Only ever one of editing/building at once.
  const [building, setBuilding] = useState(openBuilder);
  // Reopened from the unsaved-changes banner: open, then tell App the request was used up.
  useEffect(() => {
    if (!openBuilder) return;
    setBuilding(true);
    onBuilderOpened?.();
  }, [openBuilder, onBuilderOpened]);
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
  const isDraft = assignment.status === "Draft";

  if (building) {
    return (
      <li id={`assignment-${assignment.id}`} className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[assignment.type]}`}>{assignment.type}</span>
          <h3 className="card-title">{assignment.title}</h3>
        </div>
        <WorkoutBuilder
          clientId={clientId}
          assignmentId={assignment.id}
          title={assignment.title}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: queryKeys.assignments(clientId) })}
          onClose={() => setBuilding(false)}
          // The resume action must survive this card unmounting (the coach navigated away), so it
          // is built by App, which can navigate back. Falling back to a local reopen keeps the
          // builder usable on its own.
          onResume={registerResume?.(clientId, assignment.id) ?? (() => setBuilding(true))}
        />
      </li>
    );
  }

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
        {isDraft && (
          <span className="rounded-full bg-amber px-2.5 py-0.5 text-xs font-bold text-amber-text">Draft</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-dim">
        <span>{formatDay(assignment.date)}</span>
        {isDraft ? (
          // A draft is coach-only. Publishing is the one meaningful action; the Active/Done/Paused
          // toggle only makes sense once the client can actually see the plan.
          <span className="text-dim">Only you can see this until you publish it.</span>
        ) : (
          <div role="group" aria-label="Status" className="flex items-center gap-1">
            {isDone && (
              <span title="Done" className="mr-1 font-bold text-accent2">
                ✓
              </span>
            )}
            {ASSIGNMENT_STATUSES.filter((s) => s !== "Draft").map((s) => {
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
        )}
        <div className="ml-auto flex items-center gap-2">
          {isDraft && (
            <button type="button" disabled={busy} onClick={() => statusMutation.mutate("Active")} className="btn btn-primary">
              {statusMutation.isPending ? "Publishing..." : "Publish to client"}
            </button>
          )}
          {/* Nov 2026: the structured builder is the depth of a workout, so it is a visible button on
              the card - not a line hidden in the "..." menu where a coach had to go looking for it.
              Only a workout has sections and sets; Nutrition / Habit / Recovery stay plain text. */}
          {assignment.type === "Workout" && (
            <button type="button" disabled={busy} onClick={() => setBuilding(true)} className="btn btn-secondary">
              Build sets and reps
            </button>
          )}
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
        <div className="mt-2 rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm">
          <p className="font-semibold text-accent2">
            Done by client
            {assignment.clientEffort != null && <span className="font-normal text-text"> · Effort {assignment.clientEffort}/10</span>}
          </p>
          {assignment.clientNote && <p className="mt-1 whitespace-pre-wrap text-text">“{assignment.clientNote}”</p>}
          {/* Nov 2026: what they actually lifted, per exercise - the point of in-workout logging. */}
          {assignment.clientSetLog && assignment.clientSetLog.exercises.length > 0 && (
            <ul aria-label="Logged sets" className="mt-2 grid gap-0.5">
              {assignment.clientSetLog.exercises.map((ex) => {
                const did = ex.sets.filter((s) => s.done).length;
                const loads = ex.sets.filter((s) => s.done && s.weightKg !== null).map((s) => s.weightKg as number);
                return (
                  <li key={ex.seq} className="text-text">
                    <span className="font-semibold">{ex.name}</span>
                    <span className="tabular-nums text-dim">
                      {" "}
                      - {did}/{ex.plannedSets} sets
                      {loads.length > 0 ? ` · ${showWeight(Math.max(...loads), units)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      <div className="mt-2">
        <PlanDetails details={assignment.details} />
      </div>
      {assignment.reasoning.trim() !== "" && <p className="mt-2 text-sm text-dim">Why: {inline(assignment.reasoning)}</p>}
    </li>
  );
}
