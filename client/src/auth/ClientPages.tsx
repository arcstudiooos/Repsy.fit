// Client sign-in pages (Prompt 65): /client/login, /client/set-password and /client.
// For CLIENTS invited by their coach - a separate sign-in from the coach's /login, with its own
// server routes (/api/client-auth) and its own cookie. There is no sign-up here: a client account
// only exists after the coach sends an invite, so these pages never link to registration.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, clientLogin, clientLogout, clientSetPassword, getClientAccount, getMyPlan, getMySessions, queryKeys } from "../api";
import { dayHeading, timeRangeText, viewerTimeZone } from "../lib/schedule";
import { ClientLoginSchema, ClientSetPasswordSchema } from "../authSchemas";
import { LoadingState, plainErrorMessage } from "../components/States";
import { navigate } from "../route";
import { InternalLink, TextField, validate, type FieldErrors } from "./AuthPages";

export const CLIENT_SIGN_IN_TITLE = "Client sign-in - Repsy Coach";

function Shell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <img src="/favicon.png" alt="Repsy" width={48} height={48} className="mx-auto h-12 w-12" />
        <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wide text-dim">For clients</p>
        <h1 className="mt-1 text-center text-3xl">{title}</h1>
        <p className="mt-1 text-center text-sm text-dim">{intro}</p>
        {children}
      </div>
    </main>
  );
}

function ServerError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm font-semibold text-amber-text">
      {message}
    </p>
  ) : null;
}

function ClientLoginPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const justSet = new URLSearchParams(window.location.search).get("set") === "1";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(ClientLoginSchema, { email, password });
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      const parsed = ClientLoginSchema.parse({ email, password });
      const account = await clientLogin(parsed.email, parsed.password);
      // Nothing from a coach session in this browser may ever show to a client.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.clientAccount, account);
      navigate("/client");
    } catch (err) {
      setServerError(plainErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Shell title="Client sign-in" intro="Repsy Coach - for clients invited by their coach.">
      {justSet && (
        <p role="status" className="mt-6 text-center text-sm font-semibold text-accent2">
          Your password is set. Sign in with it below.
        </p>
      )}
      <form onSubmit={submit} noValidate aria-label={CLIENT_SIGN_IN_TITLE} className="mt-6 grid gap-4">
        <TextField id="client-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
        <TextField
          id="client-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={errors.password}
        />
        <ServerError message={serverError} />
        <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
          {busy ? "Please wait..." : "Sign in"}
        </button>
      </form>
      {/* No sign-up link on purpose: client accounts exist only by invite. */}
      <p className="mt-5 text-center text-sm text-dim">
        Forgot your password, or no account yet? Ask your coach to send you a new invite.
      </p>
    </Shell>
  );
}

function ClientSetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(ClientSetPasswordSchema, { token, password });
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      await clientSetPassword(token, password);
      navigate("/client/login?set=1");
    } catch (err) {
      setServerError(plainErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Shell title="Choose your password" intro="Your coach invited you to Repsy Coach. Use at least 10 characters.">
      {token ? (
        <form onSubmit={submit} noValidate aria-label="Choose your password" className="mt-6 grid gap-4">
          <TextField
            id="client-new-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            error={errors.password}
          />
          <ServerError message={serverError} />
          <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
            {busy ? "Please wait..." : "Set password"}
          </button>
        </form>
      ) : (
        <p role="alert" className="mt-6 text-center text-sm font-semibold text-amber-text">
          This invite link is not valid any more. Please ask your coach for a new one.
        </p>
      )}
      <p className="mt-5 text-center text-sm">
        <InternalLink to="/client/login">Already set it? Sign in</InternalLink>
      </p>
    </Shell>
  );
}

const dayText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { dateStyle: "medium" });

/**
 * "My plan" (Prompt 68): the client's OWN plan name, status and next due date, and the date of their
 * own last payment. No amounts, no payment history, nothing about any other client.
 */
function MyPlanSection() {
  const plan = useQuery({ queryKey: queryKeys.myPlan, queryFn: getMyPlan, retry: false });
  return (
    <section aria-label="My plan" className="mt-6 rounded-lg border border-border bg-surface2 p-4 text-left">
      <h2 className="text-base">My plan</h2>
      {plan.isPending ? (
        <p className="mt-2 text-sm text-dim">Loading...</p>
      ) : plan.isError ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(plan.error)}
        </p>
      ) : !plan.data.plan ? (
        <p className="mt-2 text-sm text-dim">Your coach has not set up a plan for you yet.</p>
      ) : (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-dim">Plan</dt>
          <dd className="font-semibold text-text">{plan.data.plan.planName}</dd>
          <dt className="text-dim">Status</dt>
          <dd className="text-text">{plan.data.plan.status}</dd>
          {plan.data.plan.status !== "Ended" && (
            <>
              <dt className="text-dim">Next due</dt>
              <dd className="text-text">{dayText(plan.data.plan.nextDueDate)}</dd>
            </>
          )}
          <dt className="text-dim">Last payment</dt>
          <dd className="text-text">{plan.data.lastPaymentDate ? dayText(plan.data.lastPaymentDate) : "None recorded yet"}</dd>
        </dl>
      )}
    </section>
  );
}

/**
 * "My sessions" (Prompt 69): the client's OWN upcoming booked sessions, read-only (no booking, no
 * calendar sync, no coach notes). Times arrive as UTC and are shown in this browser's timezone.
 */
function MySessionsSection() {
  const sessions = useQuery({ queryKey: queryKeys.mySessions, queryFn: getMySessions, retry: false });
  return (
    <section aria-label="My sessions" className="mt-4 rounded-lg border border-border bg-surface2 p-4 text-left">
      <h2 className="text-base">My sessions</h2>
      {sessions.isPending ? (
        <p className="mt-2 text-sm text-dim">Loading...</p>
      ) : sessions.isError ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(sessions.error)}
        </p>
      ) : sessions.data.sessions.length === 0 ? (
        <p className="mt-2 text-sm text-dim">No upcoming sessions.</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border">
            {sessions.data.sessions.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <p className="font-semibold text-text">{s.title}</p>
                <p className="text-dim">
                  {dayHeading(new Date(s.startsAt))} · <span className="font-mono text-text">{timeRangeText(s.startsAt, s.endsAt)}</span> · {s.type}
                </p>
                {s.location && <p className="break-words text-dim">{s.location}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-dim">Times are shown in your timezone ({viewerTimeZone()}).</p>
        </>
      )}
    </section>
  );
}

/** /client: the signed-in client's own page. Signed out -> /client/login (never the coach /login). */
function ClientHomePage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: queryKeys.clientAccount, queryFn: getClientAccount, retry: false });
  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (signedOut) navigate("/client/login", { replace: true });
  }, [signedOut]);
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await clientLogout();
    } finally {
      queryClient.clear();
      navigate("/client/login", { replace: true });
    }
  }

  if (me.isPending || signedOut) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg px-4">
        <LoadingState />
      </main>
    );
  }
  if (me.isError) {
    return (
      <Shell title="Client sign-in" intro="Repsy Coach">
        <p role="alert" className="mt-6 text-center text-sm font-semibold text-amber-text">
          {plainErrorMessage(me.error)}
        </p>
      </Shell>
    );
  }
  return (
    <Shell title={`Hi, ${me.data.name}`} intro={`Signed in as ${me.data.loginEmail ?? "you"}.`}>
      <MyPlanSection />
      <MySessionsSection />
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="min-h-11 rounded-lg border border-border bg-surface2 px-5 text-sm font-semibold text-text hover:border-dim disabled:opacity-60"
        >
          {busy ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </Shell>
  );
}

export default function ClientPages({ mode }: { mode: "client-login" | "client-set-password" | "client-home" }) {
  useEffect(() => {
    document.title = mode === "client-login" ? CLIENT_SIGN_IN_TITLE : "Repsy Coach - Client";
  }, [mode]);
  return mode === "client-login" ? <ClientLoginPage /> : mode === "client-set-password" ? <ClientSetPasswordPage /> : <ClientHomePage />;
}
