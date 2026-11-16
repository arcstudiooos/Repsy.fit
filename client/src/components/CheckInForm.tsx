import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addProgressLog, queryKeys } from "../api";
import { Modal } from "./Modal";
import { plainErrorMessage } from "./States";
import type { NewProgressLog } from "../types";
import { useCoachUnits } from "../lib/useCoachUnits";
import { weightToKg } from "../lib/snapshotFormat";

type Props = { clientId: string };

/** Today in the coach's local time zone, as "YYYY-MM-DD". */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputClass =
  "w-full rounded-card border border-border-strong bg-surface2 px-3 py-2 text-text placeholder:text-dim focus:border-accent";

/** Weekly check-in for the selected client. Saving refreshes logs, stat cards and charts together. */

/**
 * Log a weekly check-in (Nov 2026 UI batch).
 *
 * The form used to sit between the progress charts and the check-in history: a card for WRITING
 * wedged into the middle of the cards for READING, pushing the history below the fold on every
 * visit. The fields are unchanged; they open in a dialog from one button.
 *
 * `canSubmit` lives with the fields, so the footer's Save button submits the form by id rather than
 * the wrapper trying to duplicate the validation.
 */
export function CheckInForm({ clientId }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6">
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        Log check-in
      </button>
      {open && <CheckInDialog clientId={clientId} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CheckInDialog({ clientId, onClose }: Props & { onClose: () => void }) {
  const dateRef = useRef<HTMLInputElement>(null);
  // The footer button belongs to the dialog but the validation belongs to the fields, so the fields
  // report it up rather than the dialog growing a second copy of the same rules.
  const [state, setState] = useState({ canSubmit: false, pending: false });
  const onState = useCallback((next: { canSubmit: boolean; pending: boolean }) => setState(next), []);
  return (
    <Modal
      title="Weekly check-in"
      description="Weight, adherence, workouts and a note. Blank fields are left out."
      size="md"
      initialFocus={dateRef}
      onRequestClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" form="weekly-checkin" disabled={!state.canSubmit} className="btn btn-primary">
            {state.pending ? "Saving..." : "Add check-in"}
          </button>
        </>
      }
    >
      <CheckInFields clientId={clientId} onSaved={onClose} dateRef={dateRef} onState={onState} />
    </Modal>
  );
}

function CheckInFields({
  clientId,
  onSaved,
  dateRef,
  onState,
}: Props & {
  onSaved: () => void;
  dateRef: RefObject<HTMLInputElement | null>;
  onState: (s: { canSubmit: boolean; pending: boolean }) => void;
}) {
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
      onSaved();
    },
  });

  const adherenceNumber = Number(adherence);
  const adherenceInvalid =
    adherence.trim() !== "" && (!Number.isInteger(adherenceNumber) || adherenceNumber < 0 || adherenceNumber > 100);
  const workoutsNumber = Number(workouts);
  const workoutsInvalid =
    workouts.trim() !== "" && (!Number.isInteger(workoutsNumber) || workoutsNumber < 0 || workoutsNumber > 14);
  // The coach types in THEIR unit; the database stores kg. The 500 ceiling is a kg ceiling, so it
  // is checked after conversion - otherwise a pound coach is blocked at 500 lb (227 kg).
  const units = useCoachUnits();
  const weightNumber = Number(weight);
  const weightKgValue = Number.isFinite(weightNumber) ? weightToKg(weightNumber, units) : NaN;
  const weightInvalid =
    weight.trim() !== "" && (!Number.isFinite(weightKgValue) || weightKgValue <= 0 || weightKgValue > 500);
  const dateMissing = date === "";
  const futureDate = date > localToday();
  const canSubmit = !dateMissing && !adherenceInvalid && !workoutsInvalid && !weightInvalid && !save.isPending;

  // Report validity up for the dialog's footer button. Primitives in the dependency list, so this
  // runs only when the answer actually changes.
  const pending = save.isPending;
  useEffect(() => {
    onState({ canSubmit, pending });
  }, [canSubmit, pending, onState]);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!canSubmit) return;
    const input: NewProgressLog = { date, note: note.trim() };
    if (weight.trim() !== "") input.weightKg = weightKgValue;
    if (adherence.trim() !== "") input.adherence = adherenceNumber;
    if (workouts.trim() !== "") input.workoutsDone = workoutsNumber;
    save.mutate(input);
  }

  return (
    <form id="weekly-checkin" onSubmit={submit} noValidate aria-label="Weekly check-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="checkin-date" className="mb-1 block text-sm font-semibold text-text">
            Date
          </label>
          <input
            id="checkin-date"
            ref={dateRef}
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={dateMissing}
            aria-describedby={dateMissing || futureDate ? "checkin-date-note" : undefined}
          />
          {dateMissing && (
            <p id="checkin-date-note" className="mt-1 text-sm font-semibold text-accent">
              Pick a date for this check-in
            </p>
          )}
          {futureDate && (
            <p id="checkin-date-note" role="status" className="mt-1 text-sm text-amber-text">
              This date is in the future - is that right?
            </p>
          )}
        </div>
        <div>
          <label htmlFor="checkin-weight" className="mb-1 block text-sm font-semibold text-text">
            Weight {units}
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
            aria-invalid={weightInvalid}
            aria-describedby={weightInvalid ? "checkin-weight-error" : undefined}
          />
          {weightInvalid && (
            <p id="checkin-weight-error" className="mt-1 text-sm font-semibold text-accent">
              Weight must be more than 0 {units}
            </p>
          )}
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
              Adherence must be a whole number between 0 and 100
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
            aria-invalid={workoutsInvalid}
            aria-describedby={workoutsInvalid ? "checkin-workouts-error" : undefined}
          />
          {workoutsInvalid && (
            <p id="checkin-workouts-error" className="mt-1 text-sm font-semibold text-accent">
              Workouts must be a whole number between 0 and 14
            </p>
          )}
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

    </form>
  );
}
