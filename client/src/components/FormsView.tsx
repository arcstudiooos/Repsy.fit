// Forms: the list, the builder and the answers (Inspo C1/C2, Nov 2026).
//
// Repsy had no forms at all, and intake is the first thing a coach does with a new client. Four
// samples ship seeded, so this page is never empty on day one.
//
// DELIBERATE CHOICES
//  * A sample is read-only and copied to be changed, the same rule as a stock exercise. One pattern,
//    learned once.
//  * Questions reorder with Up / Down buttons: no new dependency, and keyboard-reachable.
//  * Collapsed questions show "type · Required", which is Spur.fit's one genuinely good builder
//    detail - a long form stays scannable.
//  * Answers are filled in BY THE COACH here. The client app does not post to forms yet, so nothing
//    here pretends a client can.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  copyForm,
  createForm,
  deleteForm,
  listForms,
  listSubmissions,
  queryKeys,
  submitForm,
  updateForm,
} from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { ErrorState, LoadingState, plainErrorMessage } from "./States";
import {
  CHOICE_TYPES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type Client,
  type CoachForm,
  type FormQuestion,
  type QuestionType,
  type FormSubmission,
} from "../types";

const field = "w-full rounded-lg border border-border-strong bg-surface2 px-3 py-2 text-sm text-text";

/** A readable id from a label, unique within the form: answers are stored against it. */
function questionId(label: string, taken: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "question";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) if (!taken.includes(`${base}_${n}`)) return `${base}_${n}`;
}

const blankQuestion = (taken: string[]): FormQuestion => ({
  id: questionId("question", taken),
  type: "text",
  label: "",
  help: "",
  required: true,
  options: [],
});

export function FormsView({ clients }: { clients: Client[] }) {
  const queryClient = useQueryClient();
  const formsQuery = useQuery({ queryKey: queryKeys.forms, queryFn: listForms });
  const [editing, setEditing] = useState<CoachForm | "new" | null>(null);
  const [answering, setAnswering] = useState<CoachForm | null>(null);
  const [viewing, setViewing] = useState<CoachForm | null>(null);
  const [toDelete, setToDelete] = useState<CoachForm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.forms });

  const copy = useMutation({
    mutationFn: copyForm,
    onSuccess: async (made) => {
      await refresh();
      setNotice(`Copied as "${made.name}". Edit it under your forms.`);
      setEditing(made);
    },
    onError: (e) => setError(plainErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: deleteForm,
    onSuccess: async () => {
      await refresh();
      setToDelete(null);
      setNotice("Form deleted.");
    },
    onError: (e) => {
      setToDelete(null);
      setError(plainErrorMessage(e));
    },
  });

  if (formsQuery.isPending) return <LoadingState />;
  if (formsQuery.isError) return <ErrorState error={formsQuery.error} onRetry={() => void formsQuery.refetch()} />;

  if (editing) {
    return (
      <FormBuilder
        form={editing === "new" ? null : editing}
        onDone={async () => {
          await refresh();
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }
  if (answering) return <AnswerForm form={answering} clients={clients} onDone={() => setAnswering(null)} />;
  if (viewing) return <Submissions form={viewing} onBack={() => setViewing(null)} />;

  const forms = formsQuery.data ?? [];
  const mine = forms.filter((f) => !f.sample);
  const samples = forms.filter((f) => f.sample);

  const card = (f: CoachForm) => (
    <li key={f.id} className="card grid gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-bold">{f.name}</h4>
          {f.description && <p className="mt-0.5 text-sm text-dim">{f.description}</p>}
        </div>
        {f.sample && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-dim">
            Repsy
          </span>
        )}
      </div>
      <p className="text-sm text-dim">
        {f.questions.length} {f.questions.length === 1 ? "question" : "questions"}
        {f.submissionCount > 0 && ` · ${f.submissionCount} answered`}
      </p>
      <div className="flex flex-wrap gap-2">
        {clients.length > 0 && (
          <button type="button" className="btn btn-primary min-h-10" onClick={() => setAnswering(f)}>
            Fill in
          </button>
        )}
        {f.submissionCount > 0 && (
          <button type="button" className="btn btn-secondary min-h-10" onClick={() => setViewing(f)}>
            See answers
          </button>
        )}
        {f.sample ? (
          <button
            type="button"
            className="btn btn-secondary min-h-10"
            disabled={copy.isPending}
            onClick={() => copy.mutate(f.id)}
          >
            Copy to my forms
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary min-h-10" onClick={() => setEditing(f)}>
              Edit
            </button>
            <button type="button" className="btn btn-secondary min-h-10" onClick={() => setToDelete(f)}>
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <section aria-label="Forms" className="mt-4 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">Forms</h3>
          <p className="text-sm text-dim">Intake and assessment questions, and the answers your clients gave.</p>
        </div>
        <button type="button" className="btn btn-primary min-h-11" onClick={() => setEditing("new")}>
          New form
        </button>
      </div>

      {notice && (
        <p role="status" className="text-sm font-semibold text-accent2">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {error}
        </p>
      )}

      <div>
        <h4 className="text-sm font-bold">Your forms</h4>
        {mine.length === 0 ? (
          <p className="mt-2 rounded-card bg-surface2 px-4 py-4 text-sm text-dim">
            None of your own yet. Copy one of Repsy's below and change it, or start from scratch.
          </p>
        ) : (
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">{mine.map(card)}</ul>
        )}
      </div>

      {samples.length > 0 && (
        <div>
          <h4 className="text-sm font-bold">Repsy's forms</h4>
          <p className="text-sm text-dim">Ready to use as they are, or copy one and make it yours.</p>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">{samples.map(card)}</ul>
        </div>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete "${toDelete.name}"?`}
          confirmLabel="Delete form"
          pendingLabel="Deleting..."
          pending={remove.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => remove.mutate(toDelete.id)}
        >
          {toDelete.submissionCount > 0
            ? `This also deletes ${toDelete.submissionCount} ${toDelete.submissionCount === 1 ? "answer" : "answers"} already given. That cannot be undone.`
            : "This cannot be undone."}
        </ConfirmDialog>
      )}
    </section>
  );
}

/** The question editor. */
function FormBuilder({ form, onDone, onCancel }: { form: CoachForm | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(form?.name ?? "");
  const [description, setDescription] = useState(form?.description ?? "");
  const [questions, setQuestions] = useState<FormQuestion[]>(form?.questions ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      form
        ? updateForm(form.id, { name: name.trim(), description: description.trim(), questions })
        : createForm({ name: name.trim(), description: description.trim(), questions }),
    onSuccess: onDone,
    onError: (e) => setProblem(plainErrorMessage(e)),
  });

  const update = (i: number, patch: Partial<FormQuestion>) =>
    setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setQuestions(next);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setProblem("Give the form a name.");
    for (const [i, q] of questions.entries()) {
      if (!q.label.trim()) return setProblem(`Question ${i + 1} needs a label.`);
      if (CHOICE_TYPES.includes(q.type) && q.options.filter((o) => o.trim()).length < 2) {
        return setProblem(`Question ${i + 1} needs at least two options.`);
      }
    }
    setProblem(null);
    save.mutate();
  }

  return (
    <form onSubmit={submit} noValidate aria-label={form ? "Edit form" : "New form"} className="mt-4 grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="form-name" className="mb-1 block text-sm font-bold">
            Form name
          </label>
          <input id="form-name" value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus />
        </div>
        <div>
          <label htmlFor="form-desc" className="mb-1 block text-sm font-bold">
            What it is for (optional)
          </label>
          <input id="form-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
        </div>
      </div>

      <ul className="grid gap-2">
        {questions.map((q, i) => {
          const isOpen = open === q.id;
          return (
            <li key={q.id} className="rounded-card border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-dim">{i + 1}</span>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : q.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate font-semibold text-text">{q.label || "(no question yet)"}</span>
                  {/* Spur.fit's one genuinely good builder detail: a collapsed row still says what it is. */}
                  <span className="block text-xs text-dim">
                    {QUESTION_TYPE_LABELS[q.type]}
                    {q.required ? " · Required" : " · Optional"}
                    {isOpen ? "" : " · Click to edit"}
                  </span>
                </button>
                <button type="button" className="btn btn-secondary min-h-10" disabled={i === 0} onClick={() => move(i, i - 1)}>
                  Up
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  disabled={i === questions.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn btn-secondary min-h-10"
                  onClick={() => setQuestions(questions.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>

              {isOpen && (
                <div className="mt-3 grid gap-3 border-t border-border pt-3">
                  <div>
                    <label htmlFor={`q-${q.id}-label`} className="mb-1 block text-sm font-bold">
                      Question
                    </label>
                    <input
                      id={`q-${q.id}-label`}
                      value={q.label}
                      onChange={(e) => update(i, { label: e.target.value })}
                      className={field}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`q-${q.id}-type`} className="mb-1 block text-sm font-bold">
                        Answer type
                      </label>
                      <select
                        id={`q-${q.id}-type`}
                        value={q.type}
                        onChange={(e) => {
                          const type = e.target.value as QuestionType;
                          // Moving to a choice type needs somewhere to put the options.
                          update(i, {
                            type,
                            options: CHOICE_TYPES.includes(type) ? (q.options.length ? q.options : ["", ""]) : [],
                          });
                        }}
                        className={field + " min-h-11"}
                      >
                        {QUESTION_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {QUESTION_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label htmlFor={`q-${q.id}-req`} className="flex min-h-11 items-end gap-2 text-sm text-text">
                      <input
                        id={`q-${q.id}-req`}
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => update(i, { required: e.target.checked })}
                        className="mb-2 h-5 w-5 rounded border-border"
                      />
                      <span className="mb-1.5">This question must be answered</span>
                    </label>
                  </div>

                  {CHOICE_TYPES.includes(q.type) && (
                    <div>
                      <p className="mb-1 text-sm font-bold">Choices</p>
                      <ul className="grid gap-2">
                        {q.options.map((o, oi) => (
                          <li key={oi} className="flex gap-2">
                            <input
                              aria-label={`Choice ${oi + 1}`}
                              value={o}
                              onChange={(e) => update(i, { options: q.options.map((x, xi) => (xi === oi ? e.target.value : x)) })}
                              className={field}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary min-h-10"
                              onClick={() => update(i, { options: q.options.filter((_, xi) => xi !== oi) })}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="btn btn-secondary mt-2 min-h-10"
                        onClick={() => update(i, { options: [...q.options, ""] })}
                      >
                        Add a choice
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="btn btn-secondary min-h-11 justify-self-start"
        onClick={() => {
          const made = blankQuestion(questions.map((q) => q.id));
          setQuestions([...questions, made]);
          setOpen(made.id);
        }}
      >
        Add a question
      </button>

      {problem && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={save.isPending} className="btn btn-primary min-h-11">
          {save.isPending ? "Saving..." : "Save form"}
        </button>
        <button type="button" className="btn btn-secondary min-h-11" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Filling a form in for a client. */
function AnswerForm({ form, clients, onDone }: { form: CoachForm; clients: Client[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => submitForm(form.id, clientId, answers),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.forms });
      onDone();
    },
    onError: (e) => setProblem(plainErrorMessage(e)),
  });

  const set = (id: string, value: string | string[]) => setAnswers({ ...answers, [id]: value });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setProblem(null);
        save.mutate();
      }}
      noValidate
      aria-label={`Fill in ${form.name}`}
      className="mt-4 grid gap-4"
    >
      <h3 className="text-lg font-bold">{form.name}</h3>
      <div>
        <label htmlFor="answer-client" className="mb-1 block text-sm font-bold">
          Which client
        </label>
        <select id="answer-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={field + " min-h-11"}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {form.questions.map((q) => {
        const value = answers[q.id];
        return (
          <div key={q.id}>
            <label htmlFor={`a-${q.id}`} className="mb-1 block text-sm font-bold">
              {q.label}
              {!q.required && <span className="font-normal text-dim"> (optional)</span>}
            </label>
            {q.help && <p className="mb-1 text-xs text-dim">{q.help}</p>}
            {q.type === "single" ? (
              <select id={`a-${q.id}`} value={(value as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} className={field + " min-h-11"}>
                <option value="">Not answered</option>
                {q.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : q.type === "multi" ? (
              <div role="group" aria-label={q.label} className="flex flex-wrap gap-1.5">
                {q.options.map((o) => {
                  const list = Array.isArray(value) ? value : [];
                  const on = list.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set(q.id, on ? list.filter((x) => x !== o) : [...list, o])}
                      className={
                        "min-h-10 rounded-full border px-3 text-sm font-semibold " +
                        (on ? "border-text bg-text text-bg" : "border-border text-text hover:border-dim")
                      }
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            ) : q.type === "longtext" ? (
              <textarea id={`a-${q.id}`} rows={3} value={(value as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} className={field} />
            ) : (
              <input
                id={`a-${q.id}`}
                type={q.type === "date" ? "date" : q.type === "number" || q.type === "scale" ? "number" : "text"}
                value={(value as string) ?? ""}
                onChange={(e) => set(q.id, e.target.value)}
                className={field}
              />
            )}
          </div>
        );
      })}

      {problem && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={save.isPending || !clientId} className="btn btn-primary min-h-11">
          {save.isPending ? "Saving..." : "Save answers"}
        </button>
        <button type="button" className="btn btn-secondary min-h-11" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The answers given, each read against the questions AS ASKED at the time. */
function Submissions({ form, onBack }: { form: CoachForm; onBack: () => void }) {
  const query = useQuery({ queryKey: queryKeys.submissions(form.id), queryFn: () => listSubmissions(form.id) });
  // Which submission is open, by position, so Next and Previous are just arithmetic.
  const [openAt, setOpenAt] = useState<number | null>(null);
  const items = query.data ?? [];

  return (
    <section aria-label={`Answers to ${form.name}`} className="mt-4 grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{form.name}</h3>
        <button type="button" className="btn btn-secondary min-h-10" onClick={onBack}>
          Back to forms
        </button>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="card text-sm text-dim">Nobody has filled this in yet.</p>
      ) : (
        /* Nov 2026: every submission used to render every question and answer in this list, so a
           12-question form filled in by 10 clients was a wall of text with no way to scan it. The
           list is now one row each; the answers open in a dialog that can walk through the batch. */
        <ul aria-label="Submissions" className="grid gap-2">
          {items.map((s, index) => (
            <li key={s.id}>
              <button
                type="button"
                aria-label={`View answers from ${s.clientName}`}
                onClick={() => setOpenAt(index)}
                className="card flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:border-border-strong"
              >
                <span className="font-bold text-text">{s.clientName}</span>
                <span className="text-sm text-dim">
                  {new Date(s.createdAt).toLocaleDateString("en-GB")} · {answeredCount(s)} of {s.asked.length} answered
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openAt !== null && items[openAt] && (
        <SubmissionDialog
          submission={items[openAt]}
          position={openAt}
          total={items.length}
          onMove={(next) => setOpenAt(next)}
          onClose={() => setOpenAt(null)}
        />
      )}
    </section>
  );
}

/** How many of the asked questions actually got an answer; blank and empty lists do not count. */
function answeredCount(s: FormSubmission): number {
  return s.asked.filter((q) => {
    const a = s.answers[q.id];
    return Array.isArray(a) ? a.length > 0 : (a ?? "").trim() !== "";
  }).length;
}

/**
 * Read one submission, and walk the batch without closing (Nov 2026 UI batch, flow 7).
 *
 * Reviewing answers is a batch job: before this, reading the next client's reply meant going back
 * to the list and finding your place again. Read-mostly, so focus lands on the dialog itself rather
 * than grabbing a control the coach did not ask for.
 */
function SubmissionDialog({
  submission,
  position,
  total,
  onMove,
  onClose,
}: {
  submission: FormSubmission;
  position: number;
  total: number;
  onMove: (next: number) => void;
  onClose: () => void;
}) {
  const when = new Date(submission.createdAt).toLocaleDateString("en-GB");
  return (
    <Modal
      title={submission.clientName}
      description={`Answered ${when} · ${position + 1} of ${total}`}
      size="md"
      onRequestClose={onClose}
      footer={
        <>
          {/* Disabled at the ends rather than wrapping: a reviewer needs to know when the batch is
              finished, and a silent wrap round to the first one hides that. */}
          <button
            type="button"
            disabled={position === 0}
            onClick={() => onMove(position - 1)}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={position >= total - 1}
            onClick={() => onMove(position + 1)}
            className="btn btn-secondary"
          >
            Next
          </button>
          {/* "Done", not "Close": the Modal already provides a ✕ labelled Close, and two controls
              with the same name is ambiguous to a screen reader reading the footer. */}
          <button type="button" onClick={onClose} className="btn btn-primary">
            Done
          </button>
        </>
      }
    >
      <dl className="grid gap-1.5">
        {/* Read against the snapshot, so this stays correct after the form was edited. */}
        {submission.asked.map((q) => {
          const a = submission.answers[q.id];
          const text = Array.isArray(a) ? a.join(", ") : (a ?? "");
          return (
            <div key={q.id} className="grid gap-0.5 border-b border-border pb-1.5 last:border-b-0 sm:grid-cols-[1fr_1fr]">
              <dt className="text-sm text-dim">{q.label}</dt>
              <dd className="text-sm text-text">{text.trim() === "" ? <span className="text-dim">not answered</span> : text}</dd>
            </div>
          );
        })}
      </dl>
    </Modal>
  );
}
