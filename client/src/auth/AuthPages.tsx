// /login and /register (Prompt 46): cream page, one centred card, the R mark, plain-words errors.
// Input rules come from the same zod file the server uses (client/src/authSchemas.ts). The session
// is the server's httpOnly cookie - nothing about it is kept in the browser's storage.
import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { PaperFrame } from "./PaperFrame";
import { useQueryClient } from "@tanstack/react-query";
import type { ZodTypeAny } from "zod";
import { login, queryKeys, register } from "../api";
import { LoginSchema, RegisterSchema } from "../authSchemas";
import { plainErrorMessage } from "../components/States";
import { navigate } from "../route";
import type { Coach } from "../types";

// Field names across the auth, reset and account forms (the last three are Prompt 47).
export type FieldErrors = Partial<Record<"name" | "email" | "password" | "currentPassword" | "newPassword", string>>;

export const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text";

/** First plain-words message per field; null when the values pass. */
export function validate(schema: ZodTypeAny, values: Record<string, string>): FieldErrors | null {
  const result = schema.safeParse(values);
  if (result.success) return null;
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof FieldErrors;
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export function InternalLink({ to, children }: { to: string; children: string }) {
  return (
    <a
      href={to}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      className="font-semibold text-accent2 underline underline-offset-4"
    >
      {children}
    </a>
  );
}

export function TextField({
  id,
  label,
  type = "text",
  autoComplete,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-semibold text-amber-text">
          {error}
        </p>
      )}
    </div>
  );
}

export default function AuthPages({ mode }: { mode: "login" | "register" }) {
  const queryClient = useQueryClient();
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(isRegister ? RegisterSchema : LoginSchema, isRegister ? { name, email, password } : { email, password });
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      const coach: Coach = isRegister
        ? await register(RegisterSchema.parse({ name, email, password }))
        : await login(LoginSchema.parse({ email, password }));
      // Whatever an earlier coach left in this browser must never show for this one.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, coach);
      navigate("/app");
    } catch (err) {
      setServerError(plainErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <PaperFrame>
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <h1 className="text-center text-4xl">{isRegister ? "Create your account" : "Log in"}</h1>
        <p className="mt-1 text-center text-sm text-dim">
          {isRegister ? "Start coaching with Repsy." : "Welcome back to Repsy Coach."}
        </p>
        <GoogleSignIn isRegister={isRegister} />
        <form onSubmit={submit} noValidate aria-label={isRegister ? "Create account" : "Log in"} className="mt-6 grid gap-4">
          {isRegister && (
            <TextField id="auth-name" label="Name" autoComplete="name" value={name} onChange={setName} error={errors.name} />
          )}
          <TextField id="auth-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
          <TextField
            id="auth-password"
            label="Password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
          {!isRegister && (
            <p className="-mt-2 text-sm">
              <InternalLink to="/forgot-password">Forgot password?</InternalLink>
            </p>
          )}
          {serverError && (
            <p role="alert" className="text-sm font-semibold text-amber-text">
              {serverError}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
            {busy ? "Please wait..." : isRegister ? "Create account" : "Log in"}
          </button>
        </form>
        {isRegister && (
          <p className="mt-3 text-center text-xs text-dim">
            By creating an account (with Google or email) you confirm you're 18 or over and agree to the{" "}
            <a className="underline" href="/terms">
              Terms
            </a>{" "}
            and{" "}
            <a className="underline" href="/privacy">
              Privacy Policy
            </a>
            .
          </p>
        )}
        <p className="mt-5 text-center text-sm text-dim">
          {isRegister ? (
            <>
              Already have an account? <InternalLink to="/login">Log in</InternalLink>
            </>
          ) : (
            <>
              New to Repsy? <InternalLink to="/register">Create an account</InternalLink>
            </>
          )}
        </p>
      </div>
    </PaperFrame>
  );
}

/** Plain words for each way a Google sign-in can come back (GET /api/auth/callback/google). */
export const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  expired: "That Google sign-in took too long. Please try again.",
  unverified: "Your Google account's email is not verified, so it can't be used here.",
  failed: "Google sign-in didn't work. Please try again, or use your email and password.",
  off: "Google sign-in is not available right now. Please use your email and password.",
  link: "An account with this email already exists. Log in with your email and password.",
};

/**
 * "Continue with Google" (shown only when the server has Google set up). It is a plain link: the
 * server redirects to Google and back, then lands on /app signed in.
 */
function GoogleSignIn({ isRegister }: { isRegister: boolean }) {
  return <GoogleButton href="/api/auth/google/start" label={isRegister ? "Sign up with Google" : "Continue with Google"} />;
}

/**
 * The "Continue with Google" link + the message for a failed attempt (?google=<reason>). Shared by the
 * coach screens and, with their own href and messages, the client sign-in and join pages (Prompt 78).
 */
export function GoogleButton({ href, label, errors = GOOGLE_ERRORS }: { href: string; label: string; errors?: Record<string, string> }) {
  const [enabled, setEnabled] = useState(false);
  const reason = new URLSearchParams(window.location.search).get("google");
  const error = reason ? (errors[reason] ?? errors.failed ?? GOOGLE_ERRORS.failed) : null;
  useEffect(() => {
    let live = true;
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : { google: false }))
      .then((p: { google?: boolean }) => live && setEnabled(p.google === true))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!enabled && !error) return null;
  return (
    <div className="mt-6">
      {error && (
        <p role="alert" className="mb-3 text-sm font-semibold text-amber-text">
          {error}
        </p>
      )}
      {enabled && (
        <>
          <a
            href={href}
            className="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface px-5 text-sm font-semibold text-text hover:bg-surface2"
          >
            <GoogleG />
            {label}
          </a>
          <p className="mt-5 flex items-center gap-3 text-xs text-dim" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </p>
        </>
      )}
    </div>
  );
}

/** Google's "G" mark. Its four colours are Google's brand (required by their sign-in branding rules), not Repsy colours. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
