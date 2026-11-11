// /login and /register (Prompt 46): cream page, one centred card, the R mark, plain-words errors.
// Input rules come from the same zod file the server uses (client/src/authSchemas.ts). The session
// is the server's httpOnly cookie - nothing about it is kept in the browser's storage.
import { useState, type FormEvent, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ZodTypeAny } from "zod";
import { login, queryKeys, register } from "../api";
import { LoginSchema, RegisterSchema } from "../authSchemas";
import { plainErrorMessage } from "../components/States";
import { navigate } from "../route";
import type { Coach } from "../types";

type Field = "name" | "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text";

/** First plain-words message per field; null when the values pass. */
function validate(schema: ZodTypeAny, values: Record<string, string>): FieldErrors | null {
  const result = schema.safeParse(values);
  if (result.success) return null;
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as Field;
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

function InternalLink({ to, children }: { to: string; children: string }) {
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

function TextField({
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
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <img src="/favicon.png" alt="Repsy" width={48} height={48} className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-center text-3xl">{isRegister ? "Create your account" : "Log in"}</h1>
        <p className="mt-1 text-center text-sm text-dim">
          {isRegister ? "Start coaching with Repsy." : "Welcome back to Repsy Coach."}
        </p>
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
          {serverError && (
            <p role="alert" className="text-sm font-semibold text-amber-text">
              {serverError}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
            {busy ? "Please wait..." : isRegister ? "Create account" : "Log in"}
          </button>
        </form>
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
    </main>
  );
}
