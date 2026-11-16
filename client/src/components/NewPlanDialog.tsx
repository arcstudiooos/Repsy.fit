import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../api";
import { ManualAssignmentForm } from "./ManualAssignmentForm";
import { Modal } from "./Modal";
import { localToday } from "../tabs/AiCoachTab";

/**
 * Write a plan for one client without leaving the screen you are on (Nov 2026 UI batch).
 *
 * A task row saying "no plan for 9 days" used to offer only a jump into another tab, which is the
 * same defect the library had: the coach lost the list of everything else still waiting. The plan
 * is written here and the row disappears from the list behind.
 *
 * It lives in its own module because Home is not the only place a coach decides someone needs a
 * plan - the roster opens the same dialog from a client's own card.
 *
 * It is the SAME ManualAssignmentForm the planner uses, so nothing about what gets saved can drift.
 */
export function NewPlanDialog({ client, onClose }: { client: { id: string; name: string }; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  return (
    <Modal title={`New plan for ${client.name}`} size="lg" onRequestClose={onClose}>
      {saved ? (
        <p role="status" className="text-sm font-semibold text-accent2">
          Plan saved for {client.name}.
        </p>
      ) : (
        <ManualAssignmentForm
          clientId={client.id}
          onCreated={async () => {
            setSaved(true);
            // Home's task list is what the coach is looking at, so it has to agree with what they
            // just did - otherwise the row they cleared is still sitting there.
            await queryClient.invalidateQueries({ queryKey: queryKeys.todayTasks(localToday()) });
          }}
          onCancel={onClose}
        />
      )}
    </Modal>
  );
}
