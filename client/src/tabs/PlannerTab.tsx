import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAssignments, queryKeys } from "../api";
import { ErrorState, LoadingState } from "../components/States";
import { ASSIGNMENT_TYPES, type Assignment, type AssignmentType, type Client } from "../types";
import { TYPE_CHIP } from "./AiCoachTab";

type Props = { client: Client | null; onOpenAiCoach: () => void };

type Filter = "All" | AssignmentType;
const FILTERS: Filter[] = ["All", ...ASSIGNMENT_TYPES];

// Manual Planner tab: everything assigned to the selected client
// (GET /api/clients/:clientId/assignments, newest first), with instant type filters.
export function PlannerTab({ client, onOpenAiCoach }: Props) {
  const [filter, setFilter] = useState<Filter>("All");

  const assignmentsQuery = useQuery({
    queryKey: queryKeys.assignments(client?.id ?? "none"),
    queryFn: () => listAssignments(client!.id),
    enabled: !!client,
  });

  const all = assignmentsQuery.data ?? [];
  // Client-side only: the list is already loaded, so filtering never refetches.
  const shown = filter === "All" ? all : all.filter((a) => a.type === filter);

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
    </>
  );
}

function AssignmentCard({ assignment }: { assignment: Assignment }) {
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TYPE_CHIP[assignment.type]}`}>
          {assignment.type}
        </span>
        <h3 className="text-lg">{assignment.title}</h3>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-dim">
          {assignment.source === "ai" ? "AI" : "Manual"}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-sm text-dim">
        <span>{assignment.date}</span>
        <span className="font-semibold text-text">{assignment.status}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-text">{assignment.details}</p>
      {assignment.reasoning.trim() !== "" && <p className="mt-2 text-sm text-dim">Why: {assignment.reasoning}</p>}
    </li>
  );
}
