import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addProgressLog, queryKeys } from "../api";
import { plainErrorMessage } from "./States";
import type { NewProgressLog } from "../types";

type Props = { clientId: string };

/** Today in the coach's local time zone, as "YYYY-MM-DD". */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputClass =
  "w-full rounded-card border border-border bg-surface2 px-3 py-2 text-text placeholder:text-dim focus:border-accent focus:outline-none";

/** Weekly check-in for the selected client. Saving refreshes logs, stat cards and charts together. */
export function CheckInForm({ clientId }: Props) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(localToday);
  const [weight, setWeight] = useState("");
  const [adherence, setAdherence] = useState("85");
  const [workouts, setWorkouts] = useState("4");
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: (input: NewProgressLog) => addProgressLog(clientId, input),
    onSuccess: async () => {
      // Logs feed the list, the stat cards and the charts - one refresh updates all of them.
      await queryClient.invalidateQueries({ queryKey: queryKeys.progress(clientId) });
      setWeight("");
      setNote("");
    },
  });

  const adherenceNumber = Number(adherence);
  const adherenceInvalid =
    adherence.trim() !== "" && (!Number.isFinite(adherenceNumber) || adherenceNumber < 0 || adherenceNumber > 100);
  const futureDate = date > localToday();
  const canSubmit = date !== "" && !adherenceInvalid && !save.isPending;

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!canSubmit) return;
    const input: NewProgressLog = { date, note: note.trim() };
    if (weight.trim() !== "") input.weightKg = Number(weight);
    if (adherence.trim() !== "") input.adherence = adherenceNumber;
    if (workouts.trim() !== "") input.workoutsDone = Number(workouts);
    save.mutate(input);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Weekly check-in" className="card mt-6 p-5">
      <h3 className="mb-4 text-lg">Weekly check-in</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="checkin-date" className="mb-1 block text-sm font-semibold text-text">
            Date
          </label>
          <input id="checkin-date" type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          {futureDate && <p className="mt-1 text-sm text-amber-text">This date is in the future - is that right?</p>}
        </div>
        <div>
          <label htmlFor="checkin-weight" className="mb-1 block text-sm font-semibold text-text">
            Weight kg
          </label>
          <input
            id="checkin-weight"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            className={inputClass}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="checkin-adherence" className="mb-1 block text-sm font-semibold text-text">
            Adherence %
          </label>
          <input
            id="checkin-adherence"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className={inputClass}
            value={adherence}
            onChange={(e) => setAdherence(e.target.value)}
            aria-invalid={adherenceInvalid}
            aria-describedby={adherenceInvalid ? "checkin-adherence-error" : undefined}
          />
          {adherenceInvalid && (
            <p id="checkin-adherence-error" className="mt-1 text-sm font-semibold text-accent">
              Adherence must be between 0 and 100
            </p>
          )}
        </div>
        <div>
          <label htmlFor="checkin-workouts" className="mb-1 block text-sm font-semibold text-text">
            Workouts done
          </label>
          <input
            id="checkin-workouts"
            type="number"
            inputMode="numeric"
            min={0}
            max={14}
            className={inputClass}
            value={workouts}
            onChange={(e) => setWorkouts(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="checkin-note" className="mb-1 block text-sm font-semibold text-text">
            Note
          </label>
          <input
            id="checkin-note"
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Solid week, sleep better"
          />
        </div>
      </div>

      {save.isError && (
        <p role="alert" className="mt-4 text-sm font-semibold text-accent">
          Couldn't save the check-in: {plainErrorMessage(save.error)}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-primary mt-4 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {save.isPending ? "Saving..." : "Add check-in"}
      </button>
    </form>
  );
}
