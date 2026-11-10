// "Start free" capture (Prompt 41): name + email -> POST /api/leads. No password, no payment.
import { useState, type FormEvent } from "react";
import { ApiError, createLead } from "../api";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Result = { kind: "saved"; name: string } | { kind: "already" } | null;

const inputClass = "min-h-11 w-full rounded-lg border px-3 text-base";
const inputStyle = { borderColor: "#e6e0d6", background: "#ffffff", color: "#1a1a1a" };

export default function LeadForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  const nameError = touched && !name.trim() ? "Please enter your name." : null;
  const emailError = touched && !EMAIL.test(email.trim()) ? "Please enter a valid email address." : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!name.trim() || !EMAIL.test(email.trim())) return;
    setSaving(true);
    try {
      const lead = await createLead({ name: name.trim(), email: email.trim() });
      setResult({ kind: "saved", name: lead.name });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setResult({ kind: "already" });
      else if (err instanceof ApiError && err.status === 400) setServerError(err.message);
      else setServerError("We couldn't save that just now. Please try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div role="status" className="landing-card mt-8 max-w-xl p-6" data-testid="lead-result">
        <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-heading)", textTransform: "uppercase" }}>
          {result.kind === "saved" ? `You're on the list, ${result.name}.` : "You are already on the list."}
        </p>
        <p className="landing-dim mt-2">
          {result.kind === "saved"
            ? "We'll email you when your free trial is ready. You can open the app with sample data now."
            : "No need to sign up twice - we have your email."}
        </p>
        <a href="/app" className="l-link mt-4 inline-flex min-h-10 items-center text-sm font-bold uppercase tracking-wider underline decoration-2 underline-offset-[6px]">
          Try it in the app
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Start free" className="mt-8 grid max-w-xl gap-4">
      <div>
        <label htmlFor="lead-name" className="mb-1 block text-sm font-bold">
          Name
        </label>
        <input id="lead-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} aria-describedby={nameError ? "lead-name-error" : undefined} className={inputClass} style={inputStyle} />
        {nameError && (
          <p id="lead-name-error" className="mt-1 text-sm font-semibold" style={{ color: "#92400e" }}>
            {nameError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="lead-email" className="mb-1 block text-sm font-bold">
          Email
        </label>
        <input id="lead-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!emailError} aria-describedby={emailError ? "lead-email-error" : "lead-privacy"} className={inputClass} style={inputStyle} />
        {emailError && (
          <p id="lead-email-error" className="mt-1 text-sm font-semibold" style={{ color: "#92400e" }}>
            {emailError}
          </p>
        )}
      </div>
      {serverError && (
        <p role="alert" className="text-sm font-semibold" style={{ color: "#92400e" }}>
          {serverError}
        </p>
      )}
      <button type="submit" disabled={saving} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
        {saving ? "Saving..." : "Start free"}
      </button>
      <p id="lead-privacy" className="landing-dim text-xs">
        We only use your name and email to contact you about Repsy Coach. No password, no payment details.
      </p>
    </form>
  );
}
