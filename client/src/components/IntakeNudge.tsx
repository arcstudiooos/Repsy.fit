// The intake nudge (Inspo C8, Nov 2026), shown on a client's Check-ins tab.
//
// This is what makes the Account setting do something: a coach who chose an intake form is reminded,
// per client, until it is done. It shows NOTHING when there is no form chosen or it is already done
// and old news - a permanent banner is wallpaper, and wallpaper is ignored.
//
// HONEST SCOPE: the coach fills it in. The client app cannot do forms yet, and the copy says so.
import { useQuery } from "@tanstack/react-query";
import { getIntake, queryKeys } from "../api";

export function IntakeNudge({ clientId }: { clientId: string }) {
  const query = useQuery({ queryKey: queryKeys.intake(clientId), queryFn: () => getIntake(clientId) });

  // Silent while loading and silent on failure: a nudge is not worth an error message, and the
  // Check-ins tab must not look broken because a reminder could not load.
  if (query.isPending || query.isError) return null;
  const state = query.data;
  if (!state?.form) return null;

  if (state.doneAt) {
    return (
      <p className="mt-4 text-sm text-dim">
        Intake form &ldquo;{state.form.name}&rdquo; was filled in on {new Date(state.doneAt).toLocaleDateString("en-GB")}.
      </p>
    );
  }

  return (
    <section aria-label="Intake form" className="card mt-4 p-5">
      <h3 className="card-title">Intake not done yet</h3>
      <p className="mt-1 text-sm text-dim">
        Go through &ldquo;{state.form.name}&rdquo; with this client &mdash; {state.form.questionCount}{" "}
        {state.form.questionCount === 1 ? "question" : "questions"}. You fill it in under Business &rarr; Forms; they are
        not sent anything.
      </p>
    </section>
  );
}
