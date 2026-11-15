// What happens automatically when a new client joins (Inspo C8, Nov 2026).
//
// A LEAF module: client creation and the invite-acceptance path both need this, and a helper living
// in either router would close an ESM import cycle (see CLAUDE.md).
//
// HONEST SCOPE: the client app cannot fill in forms yet, so the chosen intake form is one the COACH
// is prompted to go through with the client. Nothing here pretends a client was sent a form. When
// client-side forms land, this is the hook that changes.
import { prisma } from "../db.js";

/**
 * Sends the coach's welcome message to a brand-new client, if they wrote one.
 *
 * Best effort and silent: never throws, because a greeting must not be the reason adding a client
 * fails. An empty message means send nothing, which is what every coach meant before this existed.
 */
export async function sendWelcome(coachId: string, clientId: string): Promise<boolean> {
  try {
    const coach = await prisma.coach.findUnique({ where: { id: coachId }, select: { welcomeMessage: true } });
    const body = coach?.welcomeMessage?.trim();
    if (!body) return false;
    await prisma.threadMessage.create({
      data: {
        coachId,
        clientId,
        sender: "coach",
        body,
        // Unread, so it behaves exactly like a message the coach typed: the client sees it waiting.
        readAt: null,
      },
    });
    return true;
  } catch (err) {
    console.error(
      `Could not send the welcome message to client ${clientId}: ${err instanceof Error ? err.message : String(err)}. The client was still created.`,
    );
    return false;
  }
}

export interface IntakeState {
  /** Null when the coach has chosen no intake form, or chose one they have since deleted. */
  form: { id: string; name: string; questionCount: number } | null;
  /** When it was filled in for this client, or null. */
  doneAt: Date | null;
}

/**
 * Whether this client's intake has been done.
 *
 * A stale `intakeFormId` - the coach deleted the form - reads as "no intake form" rather than an
 * error, which is why it is not a foreign key.
 */
export async function intakeState(coachId: string, clientId: string): Promise<IntakeState> {
  const coach = await prisma.coach.findUnique({ where: { id: coachId }, select: { intakeFormId: true } });
  const formId = coach?.intakeFormId;
  if (!formId) return { form: null, doneAt: null };

  const form = await prisma.form.findFirst({
    where: { id: formId, OR: [{ coachId }, { coachId: null }] },
    select: { id: true, name: true, questions: true },
  });
  if (!form) return { form: null, doneAt: null };

  const submission = await prisma.formSubmission.findFirst({
    where: { formId: form.id, clientId, coachId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return {
    form: {
      id: form.id,
      name: form.name,
      questionCount: Array.isArray(form.questions) ? form.questions.length : 0,
    },
    doneAt: submission?.createdAt ?? null,
  };
}
