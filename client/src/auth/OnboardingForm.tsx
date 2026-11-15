// What a new client gets automatically (Inspo C8, Nov 2026), in Account.
//
// HONEST SCOPE: the client app cannot fill in forms yet, so the intake form is one the COACH is
// prompted to go through with the client. The copy here says exactly that - it must never imply a
// client was emailed a form they never received.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listForms, queryKeys, updateProfile } from "../api";
import { plainErrorMessage } from "../components/States";
import type { Coach } from "../types";

const WELCOME_MAX = 1000;

export function OnboardingForm({ coach }: { coach: Coach }) {
  const queryClient = useQueryClient();
  const forms = useQuery({ queryKey: queryKeys.forms, queryFn: listForms });
  const [welcomeMessage, setWelcomeMessage] = useState(coach.welcomeMessage ?? "");
  const [intakeFormId, setIntakeFormId] = useState(coach.intakeFormId ?? "");
  const [done, setDone] = useState(false);

  const save = useMutation({
    mutationFn: () => updateProfile({ welcomeMessage: welcomeMessage.trim(), intakeFormId: intakeFormId || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setDone(true);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    save.mutate();
  }

  // The list may fail or be empty; the welcome message must still be editable either way.
  const available = forms.data ?? [];

  return (
    <form onSubmit={submit} noValidate aria-label="What a new client gets" className="grid gap-3">
      <div>
        <label htmlFor="welcome-message" className="mb-1 block text-sm font-semibold text-text">
          Welcome message
        </label>
        <p className="mb-1 text-xs text-dim">
          Sent to a new client as their first message, from you. Leave it empty to send nothing.
        </p>
        <textarea
          id="welcome-message"
          rows={3}
          maxLength={WELCOME_MAX}
          value={welcomeMessage}
          onChange={(e) => {
            setWelcomeMessage(e.target.value);
            setDone(false);
          }}
          placeholder="Welcome aboard! Tell me what you want to work on and we'll start there."
          className="w-full resize-y rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-text"
        />
        <p className="mt-1 text-xs text-dim">
          {welcomeMessage.length} of {WELCOME_MAX} characters.
        </p>
      </div>

      <div>
        <label htmlFor="intake-form" className="mb-1 block text-sm font-semibold text-text">
          Intake form
        </label>
        {/* Says who fills it in, because the client app cannot do forms yet. */}
        <p className="mb-1 text-xs text-dim">
          Repsy will remind you to go through this with every new client. You fill it in with them - they are not sent
          anything.
        </p>
        <select
          id="intake-form"
          value={intakeFormId}
          onChange={(e) => {
            setIntakeFormId(e.target.value);
            setDone(false);
          }}
          className="min-h-11 w-full rounded-lg border border-border-strong bg-surface2 px-3 text-sm text-text"
        >
          <option value="">No intake form</option>
          {available.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.sample ? " (Repsy)" : ""}
            </option>
          ))}
        </select>
        {available.length === 0 && !forms.isPending && (
          <p className="mt-1 text-xs text-dim">Build a form under Business &rarr; Forms first.</p>
        )}
      </div>

      {save.isError && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {plainErrorMessage(save.error)}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm font-semibold text-accent2">
          Saved.
        </p>
      )}
      <button type="submit" disabled={save.isPending} className="btn btn-primary min-h-11 justify-self-start">
        {save.isPending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
