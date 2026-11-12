// /forgot-password and /reset-password (Prompt 47). Same cream card as the login screens. The reset link
// itself is only ever sent by email: nothing here (or anywhere in the UI) shows or returns a link.
import { useState, type FormEvent } from "react";
import { PaperFrame } from "./PaperFrame";
import type { ReactNode } from "react";
import { forgotPassword, resetPassword } from "../api";
import { ForgotSchema, ResetSchema } from "../authSchemas";
import { plainErrorMessage } from "../components/States";
import { InternalLink, TextField, validate, type FieldErrors } from "./AuthPages";

function Shell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <PaperFrame>
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-center text-4xl">{title}</h1>
        <p className="mt-1 text-center text-sm text-dim">{intro}</p>
        {children}
      </div>
    </PaperFrame>
  );
}

function ServerError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm font-semibold text-amber-text">
      {message}
    </p>
  ) : null;
}

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(ForgotSchema, { email });
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      const reply = await forgotPassword(ForgotSchema.parse({ email }).email);
      setSentMessage(reply.message);
    } catch (err) {
      setServerError(plainErrorMessage(err));
    }
    setBusy(false);
  }

  return (
    <Shell title="Forgot your password?" intro="Enter your email and we'll send you a link to choose a new one.">
      {sentMessage ? (
        <div className="mt-6 grid gap-4">
          <p role="status" className="text-sm font-semibold text-accent2">
            {sentMessage}
          </p>
          <p className="text-sm text-dim">The link works once and expires in 1 hour. Check your spam folder if it does not arrive.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate aria-label="Forgot password" className="mt-6 grid gap-4">
          <TextField id="auth-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
          <ServerError message={serverError} />
          <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
            {busy ? "Please wait..." : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-dim">
        <InternalLink to="/login">Back to log in</InternalLink>
      </p>
    </Shell>
  );
}

function ResetPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(ResetSchema, { token, password });
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      await resetPassword(ResetSchema.parse({ token, password }));
      setDone(true);
    } catch (err) {
      setServerError(plainErrorMessage(err));
    }
    setBusy(false);
  }

  if (done) {
    return (
      <Shell title="Password changed" intro="You have been signed out everywhere.">
        <p role="status" className="mt-6 text-center text-sm font-semibold text-accent2">
          Your password is changed. Log in with the new one.
        </p>
        <p className="mt-5 text-center text-sm">
          <InternalLink to="/login">Log in</InternalLink>
        </p>
      </Shell>
    );
  }
  return (
    <Shell title="Choose a new password" intro="Use at least 10 characters.">
      {token ? (
        <form onSubmit={submit} noValidate aria-label="Reset password" className="mt-6 grid gap-4">
          <TextField
            id="auth-new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
          <ServerError message={serverError} />
          <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
            {busy ? "Please wait..." : "Set new password"}
          </button>
        </form>
      ) : (
        <p role="alert" className="mt-6 text-center text-sm font-semibold text-amber-text">
          This reset link is not valid any more. Please ask for a new one.
        </p>
      )}
      <p className="mt-5 text-center text-sm text-dim">
        <InternalLink to="/forgot-password">Ask for a new link</InternalLink>
      </p>
    </Shell>
  );
}

export default function PasswordPages({ mode }: { mode: "forgot" | "reset" }) {
  return mode === "forgot" ? <ForgotPage /> : <ResetPage />;
}
