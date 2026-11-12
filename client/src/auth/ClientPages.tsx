// Client pages: /client/login, /client/set-password and /client (Prompt 65); /join/:code, /client/welcome,
// /client/forgot-password and /client/reset-password (Prompt 77).
// For CLIENTS - a separate sign-in from the coach's /login, with its own server routes
// (/api/client-auth) and its own cookie. A client account comes from the coach's invite or from
// joining with the coach's code; there is no "sign up without a coach".
import { Suspense, lazy, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PaperFrame } from "./PaperFrame";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  clientForgotPassword,
  clientJoin,
  clientLogin,
  clientLogout,
  clientResetPassword,
  clientSetPassword,
  getClientAccount,
  getJoinInfo,
  getMyProfile,
  queryKeys,
  saveMyProfile,
} from "../api";
import { GOALS, LEVELS, type ClientProfile } from "../types";
import { ClientForgotSchema, ClientJoinSchema, ClientLoginSchema, ClientResetSchema, ClientSetPasswordSchema } from "../authSchemas";
import { LoadingState, plainErrorMessage } from "../components/States";
import { navigate } from "../route";
import { GOOGLE_ERRORS, GoogleButton, InternalLink, TextField, inputClass, validate, type FieldErrors } from "./AuthPages";

/** Prompt 78: plain words for a client's Google attempt that came back without signing in. */
const CLIENT_GOOGLE_ERRORS: Record<string, string> = {
  ...GOOGLE_ERRORS,
  link: "A client account with this email already exists. Sign in with your email and password.",
  noaccount: "No client account for this Google account. Ask your coach for their join link.",
  othercoach: "This Google account already has a Repsy client account with another coach. Sign in from the client sign-in page.",
  badcode: "This join code is not valid. Please ask your coach for a new one.",
};

// Prompt 79: the client app itself (Today, Week, plans, Me) is its own lazy chunk.
const ClientApp = lazy(() => import("../clientApp/ClientApp"));
const PendingDelete = lazy(() => import("../clientApp/MeSettings").then((m) => ({ default: m.PendingDelete })));

export const CLIENT_SIGN_IN_TITLE = "Client sign-in - Repsy Coach";

function Shell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <PaperFrame>
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-dim">For clients</p>
        <h1 className="mt-1 text-center text-4xl">{title}</h1>
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

function ClientLoginPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const justSet = new URLSearchParams(window.location.search).get("set") === "1";
  const justDeleted = new URLSearchParams(window.location.search).get("deleted") === "1";

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
      {justDeleted && (
        <p role="status" className="mt-6 text-center text-sm font-semibold text-accent2">
          Your account has been deleted.
        </p>
      )}
      <GoogleButton href="/api/client-auth/google/start" label="Continue with Google" errors={CLIENT_GOOGLE_ERRORS} />
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
      <p className="mt-4 text-center text-sm">
        <InternalLink to="/client/forgot-password">Forgot your password?</InternalLink>
      </p>
      <JoinWithCode />
    </Shell>
  );
}

/** "No account yet?" - a client types their coach's code and goes to that coach's join page. */
function JoinWithCode() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  function go(e: FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z]{4}-[A-Z0-9]{6}$/.test(clean)) {
      setError("Codes look like ANNA-7K2Q8M. Check the code your coach sent you.");
      return;
    }
    navigate(`/join/${clean}`);
  }
  return (
    <form onSubmit={go} noValidate aria-label="Join with a code" className="mt-6 border-t border-border pt-5">
      <label htmlFor="join-code-input" className="mb-1 block text-sm font-semibold">
        No account yet? Enter your coach's code
      </label>
      <div className="flex gap-2">
        <input
          id="join-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ANNA-7K2Q8M"
          aria-invalid={!!error}
          aria-describedby={error ? "join-code-input-error" : undefined}
          className={`${inputClass} font-mono uppercase`}
        />
        <button type="submit" className="min-h-11 shrink-0 rounded-lg border border-border bg-surface2 px-4 text-sm font-semibold text-text hover:border-dim">
          Next
        </button>
      </div>
      {error && (
        <p id="join-code-input-error" className="mt-1 text-sm font-semibold text-amber-text">
          {error}
        </p>
      )}
    </form>
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


/** The code in /join/:code (as typed in the link; the server ignores letter case). */
const joinCodeFromPath = () => decodeURIComponent(window.location.pathname.replace(/^\/join\//, "").replace(/\/$/, ""));

/** /join/:code - "Join Anna's coaching": sign up under the coach whose code this is. */
function JoinPage() {
  const queryClient = useQueryClient();
  const code = joinCodeFromPath();
  const info = useQuery({ queryKey: queryKeys.joinInfo(code.toUpperCase()), queryFn: () => getJoinInfo(code), retry: false });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const values = { code, name, email, password };
    const found = validate(ClientJoinSchema, values);
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      const result = await clientJoin(ClientJoinSchema.parse(values));
      if (result.status === "check-email") {
        setCheckEmail(result.message);
        setBusy(false);
        return;
      }
      // A fresh client session: nothing cached from anyone else may show.
      queryClient.clear();
      navigate(result.joinStatus === "active" || result.joinStatus === "pending" ? "/client/welcome" : "/client");
    } catch (err) {
      setServerError(plainErrorMessage(err));
      setBusy(false);
    }
  }

  if (info.isPending) {
    return (
      <PaperFrame>
        <LoadingState />
      </PaperFrame>
    );
  }
  if (info.isError) {
    return (
      <Shell title="Join your coach" intro="Repsy Coach">
        <p role="alert" className="mt-6 text-center text-sm font-semibold text-amber-text">
          {info.error instanceof ApiError && info.error.status === 404
            ? "This join code is not valid. Please ask your coach for a new one."
            : plainErrorMessage(info.error)}
        </p>
        <p className="mt-5 flex justify-center gap-4 text-sm">
          <a className="font-semibold text-accent2 underline underline-offset-4" href="/">
            Go to the home page
          </a>
          <InternalLink to="/client/login">Client sign-in</InternalLink>
        </p>
      </Shell>
    );
  }
  const coach = info.data.coachName;
  return (
    <Shell title={`Join ${coach}'s coaching`} intro={`Create your account and ${coach} becomes your coach on Repsy.`}>
      {checkEmail ? (
        <p role="status" className="mt-6 text-center text-sm font-semibold text-accent2">
          {checkEmail}
        </p>
      ) : (
        <>
          <GoogleButton
            href={`/api/client-auth/google/start?code=${encodeURIComponent(code.toUpperCase())}`}
            label="Continue with Google"
            errors={CLIENT_GOOGLE_ERRORS}
          />
          <form onSubmit={submit} noValidate aria-label="Create your client account" className="mt-6 grid gap-4">
            <TextField id="join-name" label="Your name" autoComplete="name" value={name} onChange={setName} error={errors.name} />
            <TextField id="join-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
            <TextField
              id="join-password"
              label="Password (at least 10 characters)"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              error={errors.password}
            />
            <ServerError message={serverError} />
            <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
              {busy ? "Please wait..." : "Create account"}
            </button>
          </form>
          <p className="mt-3 text-center text-xs text-dim">
            By creating an account (with Google or email) you confirm you're 18 or over and agree to the{" "}
            <a className="underline" href="/terms">Terms</a> and{" "}
            <a className="underline" href="/privacy">Privacy Policy</a>.
          </p>
        </>
      )}
      <p className="mt-5 text-center text-sm">
        <InternalLink to="/client/login">Already have an account? Sign in</InternalLink>
      </p>
    </Shell>
  );
}

const LB_PER_KG = 2.20462262;
const OTHER_GOAL = "__other__";
const round1 = (n: number) => Math.round(n * 10) / 10;

/** /client/welcome - a few questions once, after joining with a code. Skippable. */
function WelcomePage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: queryKeys.clientAccount, queryFn: getClientAccount, retry: false });
  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (signedOut) navigate("/client/login", { replace: true });
  }, [signedOut]);
  const profile = useQuery({ queryKey: queryKeys.myProfile, queryFn: getMyProfile, retry: false, enabled: me.isSuccess });
  if (me.isPending || signedOut || (me.isSuccess && profile.isPending)) {
    return (
      <PaperFrame>
        <LoadingState />
      </PaperFrame>
    );
  }
  if (me.isError || profile.isError) {
    return (
      <Shell title="Welcome" intro="Repsy Coach">
        <p role="alert" className="mt-6 text-center text-sm font-semibold text-amber-text">
          {plainErrorMessage(me.error ?? profile.error)}
        </p>
      </Shell>
    );
  }
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.clientAccount });
    navigate("/client", { replace: true });
  };
  return <WelcomeForm initial={profile.data!} coachName={me.data.coachName ?? "your coach"} onDone={done} />;
}

type WelcomeErrors = Partial<Record<"goal" | "age" | "heightCm" | "weight" | "injuries" | "consent", string>>;

function WelcomeForm({ initial, coachName, onDone }: { initial: ClientProfile; coachName: string; onDone: () => Promise<void> }) {
  const known = (GOALS as readonly string[]).includes(initial.goal);
  const [goalChoice, setGoalChoice] = useState(known ? initial.goal : initial.goal ? OTHER_GOAL : "");
  const [goalOther, setGoalOther] = useState(known ? "" : initial.goal);
  const [age, setAge] = useState(initial.age?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(initial.heightCm?.toString() ?? "");
  const [units, setUnits] = useState<"kg" | "lb">(initial.units);
  const [weight, setWeight] = useState(
    initial.weightKg == null ? "" : String(initial.units === "lb" ? round1(initial.weightKg * LB_PER_KG) : initial.weightKg),
  );
  const [level, setLevel] = useState<string>(initial.level);
  const [injuries, setInjuries] = useState(initial.injuries);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<WelcomeErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchUnits(next: "kg" | "lb") {
    if (next === units) return;
    const n = Number(weight);
    if (weight.trim() !== "" && Number.isFinite(n)) setWeight(String(round1(next === "lb" ? n * LB_PER_KG : n / LB_PER_KG)));
    setUnits(next);
  }

  async function send(body: Parameters<typeof saveMyProfile>[0]) {
    setBusy(true);
    setServerError(null);
    try {
      await saveMyProfile(body);
      await onDone();
    } catch (err) {
      setServerError(plainErrorMessage(err));
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const found: WelcomeErrors = {};
    const goal = goalChoice === OTHER_GOAL ? goalOther.trim() : goalChoice;
    if (goalChoice === OTHER_GOAL && !goal) found.goal = "Type your goal, or pick one from the list.";
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    const a = num(age);
    if (a !== null && (!Number.isInteger(a) || a < 18 || a > 120)) found.age = "Enter your age in whole years (18 or over).";
    const h = num(heightCm);
    if (h !== null && (!Number.isFinite(h) || h < 50 || h > 300)) found.heightCm = "Enter your height in cm (50 to 300).";
    const w = num(weight);
    const kg = w === null ? null : units === "lb" ? round1(w / LB_PER_KG) : w;
    if (w !== null && (!Number.isFinite(w) || kg === null || kg < 20 || kg > 500))
      found.weight = units === "lb" ? "Enter your weight in lb (45 to 1100)." : "Enter your weight in kg (20 to 500).";
    const healthGiven = h !== null || w !== null || injuries.trim() !== "";
    if (healthGiven && !initial.healthConsent && !consent)
      found.consent = "Tick the box to let your coach store your health details, or leave weight, height and injuries empty.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void send({
      ...(consent ? { healthConsent: true as const } : {}),
      ...(goal ? { goal } : {}),
      age: a,
      heightCm: h,
      weightKg: kg,
      level,
      units,
      injuries: injuries.trim(),
    });
  }

  const err = (k: keyof WelcomeErrors) =>
    errors[k] ? (
      <p id={`welcome-${k}-error`} className="mt-1 text-sm font-semibold text-amber-text">
        {errors[k]}
      </p>
    ) : null;
  const described = (k: keyof WelcomeErrors) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `welcome-${k}-error` } : {});

  return (
    <Shell title="A few quick questions" intro={`So ${coachName} can plan for you. You can skip any of them.`}>
      <form onSubmit={submit} noValidate aria-label="Welcome questions" className="mt-6 grid gap-4 text-left">
        <div>
          <label htmlFor="welcome-goal" className="mb-1 block text-sm font-semibold">
            Your main goal
          </label>
          <select id="welcome-goal" value={goalChoice} onChange={(e) => setGoalChoice(e.target.value)} className={inputClass} {...described("goal")}>
            <option value="">Choose a goal</option>
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            <option value={OTHER_GOAL}>Something else</option>
          </select>
          {goalChoice === OTHER_GOAL && (
            <input
              aria-label="Your goal in your own words"
              value={goalOther}
              onChange={(e) => setGoalOther(e.target.value)}
              maxLength={100}
              className={`${inputClass} mt-2`}
            />
          )}
          {err("goal")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="welcome-age" className="mb-1 block text-sm font-semibold">
              Age
            </label>
            <input id="welcome-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} {...described("age")} />
            {err("age")}
          </div>
          <div>
            <label htmlFor="welcome-height" className="mb-1 block text-sm font-semibold">
              Height (cm)
            </label>
            <input id="welcome-height" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={inputClass} {...described("heightCm")} />
            {err("heightCm")}
          </div>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Weight</legend>
          <div className="flex gap-2">
            <input
              id="welcome-weight"
              aria-label={`Weight in ${units}`}
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className={inputClass}
              {...described("weight")}
            />
            <div role="radiogroup" aria-label="Weight unit" className="flex shrink-0 overflow-hidden rounded-lg border border-border">
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={units === u}
                  onClick={() => switchUnits(u)}
                  className={`min-h-11 px-4 text-sm font-semibold ${units === u ? "bg-accent text-on-accent" : "bg-surface2 text-text"}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          {err("weight")}
        </fieldset>
        <div>
          <label htmlFor="welcome-level" className="mb-1 block text-sm font-semibold">
            Training experience
          </label>
          <select id="welcome-level" value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="welcome-injuries" className="mb-1 block text-sm font-semibold">
            Injuries or anything your coach should know
          </label>
          <textarea
            id="welcome-injuries"
            value={injuries}
            onChange={(e) => setInjuries(e.target.value)}
            maxLength={1000}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-base text-text"
          />
        </div>
        {!initial.healthConsent && (
          <div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                aria-describedby={errors.consent ? "welcome-consent-error" : undefined}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                I agree that {coachName} and Repsy can store the health details I enter here (weight, height, injuries) to coach me. See the{" "}
                <a className="underline" href="/privacy">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            {err("consent")}
          </div>
        )}
        <ServerError message={serverError} />
        <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
          {busy ? "Saving..." : "Save and continue"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send({ skip: true })}
          className="min-h-11 rounded-lg border border-border bg-surface2 px-5 text-sm font-semibold text-text hover:border-dim disabled:opacity-60"
        >
          Skip for now
        </button>
      </form>
    </Shell>
  );
}

/** /client/forgot-password - the same generic reply for any email. */
function ClientForgotPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(ClientForgotSchema, { email });
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      setSent((await clientForgotPassword(ClientForgotSchema.parse({ email }).email)).message);
    } catch (err) {
      setServerError(plainErrorMessage(err));
    }
    setBusy(false);
  }
  return (
    <Shell title="Forgot your password?" intro="Enter the email you sign in with and we'll send you a link.">
      {sent ? (
        <p role="status" className="mt-6 text-center text-sm font-semibold text-accent2">
          {sent}
        </p>
      ) : (
        <form onSubmit={submit} noValidate aria-label="Forgot your password" className="mt-6 grid gap-4">
          <TextField id="client-forgot-email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} />
          <ServerError message={serverError} />
          <button type="submit" disabled={busy} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
            {busy ? "Please wait..." : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-5 text-center text-sm">
        <InternalLink to="/client/login">Back to sign in</InternalLink>
      </p>
    </Shell>
  );
}

/** /client/reset-password?token=... - choose a new password; every old sign-in ends. */
function ClientResetPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(ClientResetSchema, { token, password });
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      await clientResetPassword(token, password);
      navigate("/client/login?set=1");
    } catch (err) {
      setServerError(plainErrorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Shell title="Choose a new password" intro="Use at least 10 characters.">
      {token ? (
        <form onSubmit={submit} noValidate aria-label="Choose a new password" className="mt-6 grid gap-4">
          <TextField id="client-reset-password" label="New password" type="password" autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} />
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
      <p className="mt-5 text-center text-sm">
        <InternalLink to="/client/forgot-password">Ask for a new link</InternalLink>
      </p>
    </Shell>
  );
}

/** /client and its pages: signed out -> /client/login (never the coach /login); welcome first; a pending
 *  client waits; then the client app (Prompt 79, its own lazy chunk). */
function ClientHomePage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: queryKeys.clientAccount, queryFn: getClientAccount, retry: false });
  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  const needsWelcome = me.data?.needsWelcome === true;
  useEffect(() => {
    if (signedOut) navigate("/client/login", { replace: true });
    else if (needsWelcome) navigate("/client/welcome", { replace: true });
  }, [signedOut, needsWelcome]);
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

  const loading = (
    <PaperFrame>
      <LoadingState />
    </PaperFrame>
  );
  if (me.isPending || signedOut || needsWelcome) return loading;
  if (me.isError) {
    return (
      <Shell title="Client sign-in" intro="Repsy Coach">
        <p role="alert" className="mt-6 text-center text-sm font-semibold text-amber-text">
          {plainErrorMessage(me.error)}
        </p>
      </Shell>
    );
  }
  const signOut = (
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
  );
  // Prompt 77: a client who joined while the coach approves new clients waits here.
  if (me.data.joinStatus !== "active") {
    const coach = me.data.coachName ?? "your coach";
    return (
      <Shell
        title={me.data.joinStatus === "declined" ? "Request not accepted" : `Waiting for ${coach}`}
        intro={`Signed in as ${me.data.loginEmail ?? "you"}.`}
      >
        <p role="status" className="mt-6 text-center text-sm text-text">
          {me.data.joinStatus === "declined"
            ? `${coach} declined your request to join. If you think this is a mistake, contact them directly.`
            : `${coach} approves new clients before they join. You'll see your plans here as soon as they do - check back soon.`}
        </p>
        {signOut}
        {/* Prompt 83: a waiting or declined client can still delete their account. */}
        <Suspense fallback={null}>
          <PendingDelete />
        </Suspense>
      </Shell>
    );
  }
  return (
    <Suspense fallback={loading}>
      <ClientApp account={me.data} onSignOut={logout} signingOut={busy} />
    </Suspense>
  );
}

type Mode =
  | "client-login"
  | "client-set-password"
  | "client-home"
  | "client-join"
  | "client-welcome"
  | "client-forgot"
  | "client-reset";

const TITLES: Record<Mode, string> = {
  "client-login": CLIENT_SIGN_IN_TITLE,
  "client-set-password": "Choose your password - Repsy Coach",
  "client-home": "Repsy Coach - Client",
  "client-join": "Join your coach - Repsy Coach",
  "client-welcome": "Welcome - Repsy Coach",
  "client-forgot": "Forgot password - Repsy Coach",
  "client-reset": "New password - Repsy Coach",
};

export default function ClientPages({ mode }: { mode: Mode }) {
  useEffect(() => {
    document.title = TITLES[mode];
  }, [mode]);
  switch (mode) {
    case "client-login":
      return <ClientLoginPage />;
    case "client-set-password":
      return <ClientSetPasswordPage />;
    case "client-join":
      return <JoinPage />;
    case "client-welcome":
      return <WelcomePage />;
    case "client-forgot":
      return <ClientForgotPage />;
    case "client-reset":
      return <ClientResetPage />;
    default:
      return <ClientHomePage />;
  }
}
