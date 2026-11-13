// The client's account settings on the Me tab (Prompt 83): profile, password, connected Google, timezone,
// payment history (dates only, no amounts) and deleting their account. A client can't change their coach
// or sign-in email here.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changeMyPassword, deleteMyAccount, getMyAccount, getMyPayments, getMyProfile, queryKeys, saveMyAccount, saveMyProfile } from "../api";
import { LoadingState, plainErrorMessage } from "../components/States";
import { formatDay } from "../lib/dates";
import { formatMoney } from "../lib/money";
import { navigate } from "../route";
import type { ClientProfile, MyAccount } from "../types";

const LB_PER_KG = 2.20462262;
const round1 = (n: number) => Math.round(n * 10) / 10;
const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text";
const card = "mt-4 rounded-lg border border-border bg-surface2 p-4 text-left";
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const allZones = (): string[] => {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
};

function Saved({ show }: { show: boolean }) {
  return show ? (
    <p role="status" className="mt-2 text-sm font-semibold text-accent2">
      Saved.
    </p>
  ) : null;
}
function Err({ text, id }: { text: string | null; id?: string }) {
  // id lets inputs point at the message with aria-describedby.
  return text ? (
    <p id={id} role="alert" className="mt-2 text-sm font-semibold text-amber-text">
      {text}
    </p>
  ) : null;
}

export function MeSettings() {
  const account = useQuery({ queryKey: queryKeys.myAccount, queryFn: getMyAccount });
  const profile = useQuery({ queryKey: queryKeys.myProfile, queryFn: getMyProfile });
  if (account.isPending || profile.isPending) return <LoadingState />;
  if (account.isError || profile.isError) {
    return <Err text={plainErrorMessage(account.error ?? profile.error)} />;
  }
  return (
    <>
      <ProfileSection account={account.data} profile={profile.data} />
      <SignInSection account={account.data} />
      <TimezoneSection account={account.data} />
      <PaymentsSection />
      <DeleteSection account={account.data} />
    </>
  );
}

// ---------- profile ----------

function ProfileSection({ account, profile }: { account: MyAccount; profile: ClientProfile }) {
  const qc = useQueryClient();
  const [name, setName] = useState(account.name);
  const [units, setUnits] = useState<"kg" | "lb">(profile.units);
  const [goal, setGoal] = useState(profile.goal);
  const [age, setAge] = useState(profile.age?.toString() ?? "");
  const [height, setHeight] = useState(profile.heightCm?.toString() ?? "");
  const toUnit = (kg: number | null, u: "kg" | "lb") => (kg == null ? "" : String(u === "lb" ? round1(kg * LB_PER_KG) : kg));
  const [weight, setWeight] = useState(toUnit(profile.weightKg, profile.units));
  const [level, setLevel] = useState<string>(profile.level);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const w = weight.trim() === "" ? null : Number(weight);
      if (name.trim() !== account.name) await saveMyAccount({ name: name.trim() });
      await saveMyProfile({
        units,
        goal: goal.trim() || undefined,
        age: age.trim() === "" ? null : Number(age),
        heightCm: height.trim() === "" ? null : Number(height),
        weightKg: w === null ? null : units === "lb" ? Math.round((w / LB_PER_KG) * 100) / 100 : w,
        ...(level ? { level } : {}),
        ...(consent ? { healthConsent: true as const } : {}),
      });
    },
    // Settled, not just success: if the second save fails, the first one (the name) still shows.
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.myAccount }),
        qc.invalidateQueries({ queryKey: queryKeys.myProfile }),
        qc.invalidateQueries({ queryKey: queryKeys.clientAccount }),
        qc.invalidateQueries({ queryKey: queryKeys.myProgress }),
      ]),
  });
  function switchUnits(u: "kg" | "lb") {
    // Keep the same body weight when switching what it's shown in.
    const n = weight.trim() === "" ? null : Number(weight);
    if (n !== null && Number.isFinite(n) && u !== units) setWeight(String(u === "lb" ? round1(n * LB_PER_KG) : round1(n / LB_PER_KG)));
    setUnits(u);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === "") return setError("Please enter your name.");
    if (age.trim() !== "" && (!Number.isInteger(Number(age)) || Number(age) < 18 || Number(age) > 120)) return setError("Age: a whole number from 18 to 120.");
    if (height.trim() !== "" && !(Number(height) >= 50 && Number(height) <= 300)) return setError("Height: 50 to 300 cm.");
    const w = Number(weight);
    const kg = units === "lb" ? w / LB_PER_KG : w;
    if (weight.trim() !== "" && !(kg >= 20 && kg <= 500)) return setError(`Weight: a real weight in ${units}.`);
    setError(null);
    save.mutate();
  }
  return (
    <section aria-labelledby="profile-h" className={card}>
      <h2 id="profile-h" className="card-title">
        Profile
      </h2>
      <form onSubmit={submit} noValidate aria-label="Profile" className="mt-2 grid gap-3">
        <div>
          <label htmlFor="me-name" className="mb-1 block text-sm font-semibold">
            Name
          </label>
          <input id="me-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">Weight unit</legend>
          <div className="flex gap-4">
            {(["kg", "lb"] as const).map((u) => (
              <label key={u} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="me-units" value={u} checked={units === u} onChange={() => switchUnits(u)} className="h-5 w-5" />
                {u}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="me-goal" className="mb-1 block text-sm font-semibold">
            Goal
          </label>
          <input id="me-goal" value={goal} maxLength={100} onChange={(e) => setGoal(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="me-age" className="mb-1 block text-sm font-semibold">
              Age
            </label>
            <input id="me-age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="me-height" className="mb-1 block text-sm font-semibold">
              Height (cm)
            </label>
            <input id="me-height" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="me-weight" className="mb-1 block text-sm font-semibold">
              Weight ({units})
            </label>
            <input id="me-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="sm:w-60">
          <label htmlFor="me-level" className="mb-1 block text-sm font-semibold">
            Experience
          </label>
          <select id="me-level" value={level} onChange={(e) => setLevel(e.target.value)} className={inputClass}>
            {!level && <option value="">Choose...</option>}
            {LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        {!profile.healthConsent && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
            <span>I agree that my coach and Repsy can store the health details I enter (such as weight and height) to coach me.</span>
          </label>
        )}
        <p className="text-xs text-dim">Your sign-in email and your coach can't be changed here - ask your coach if they need to change.</p>
        <Err text={error ?? (save.isError ? plainErrorMessage(save.error) : null)} />
        <Saved show={save.isSuccess} />
        <div>
          <button type="submit" disabled={save.isPending} className="btn btn-primary min-h-11">
            {save.isPending ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------- password / Google ----------

function SignInSection({ account }: { account: MyAccount }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: () => changeMyPassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
    },
  });
  if (account.googleConnected) {
    return (
      <section aria-labelledby="signin-h" className={card}>
        <h2 id="signin-h" className="card-title">
          Sign-in
        </h2>
        <p className="mt-2 text-sm text-text">
          Connected with Google{account.loginEmail ? ` (${account.loginEmail})` : ""}. You sign in with Google, so there's no password to change.
        </p>
        <p className="mt-1 text-sm text-dim">
          Want a password instead? Use{" "}
          <a href="/client/forgot-password" className="font-semibold text-accent2 underline underline-offset-4">
            Forgot password
          </a>{" "}
          to set one (this stops signing in with Google).
        </p>
      </section>
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!current) return setError("Please enter your current password.");
    if (next.length < 10) return setError("Your new password needs at least 10 characters.");
    setError(null);
    change.mutate();
  }
  return (
    <section aria-labelledby="signin-h" className={card}>
      <h2 id="signin-h" className="card-title">
        Change password
      </h2>
      <form onSubmit={submit} noValidate aria-label="Change password" className="mt-2 grid gap-3 sm:max-w-sm">
        <input type="email" autoComplete="username" value={account.loginEmail ?? ""} readOnly hidden />
        <div>
          <label htmlFor="me-current" className="mb-1 block text-sm font-semibold">
            Current password
          </label>
          <input id="me-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="me-new" className="mb-1 block text-sm font-semibold">
            New password
          </label>
          <input id="me-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-dim">At least 10 characters. You'll stay signed in here; other devices are signed out.</p>
        </div>
        <Err text={error ?? (change.isError ? plainErrorMessage(change.error) : null)} />
        {change.isSuccess && (
          <p role="status" className="text-sm font-semibold text-accent2">
            Password changed. Other devices have been signed out.
          </p>
        )}
        <div>
          <button type="submit" disabled={change.isPending} className="btn btn-primary min-h-11">
            {change.isPending ? "Changing..." : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------- timezone ----------

function TimezoneSection({ account }: { account: MyAccount }) {
  const qc = useQueryClient();
  const zones = allZones();
  const device = deviceZone();
  const save = useMutation({
    mutationFn: (tz: string | null) => saveMyAccount({ timezone: tz }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.myAccount }), qc.invalidateQueries({ queryKey: queryKeys.mySessions })]),
  });
  return (
    <section aria-labelledby="tz-h" className={card}>
      <h2 id="tz-h" className="card-title">
        Timezone
      </h2>
      <p className="mt-1 text-sm text-dim">
        Session times are shown in {account.timezone ?? device}
        {account.timezone ? " (your choice)." : " (this device's timezone)."}
      </p>
      <label htmlFor="me-tz" className="mb-1 mt-2 block text-sm font-semibold">
        Show times in
      </label>
      <select
        id="me-tz"
        value={account.timezone ?? ""}
        disabled={save.isPending}
        onChange={(e) => save.mutate(e.target.value === "" ? null : e.target.value)}
        className={`${inputClass} sm:w-80`}
      >
        <option value="">This device's timezone ({device})</option>
        {Array.from(new Set([...(zones.length > 0 ? zones : [device, "UTC"]), ...(account.timezone ? [account.timezone] : [])])).map((z) => (
          <option key={z} value={z}>
            {z.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <Saved show={save.isSuccess} />
      <Err text={save.isError ? plainErrorMessage(save.error) : null} />
    </section>
  );
}

// ---------- payments ----------

function PaymentsSection() {
  const payments = useQuery({ queryKey: queryKeys.myPayments, queryFn: getMyPayments });
  return (
    <section aria-labelledby="pay-h" className={card}>
      <h2 id="pay-h" className="card-title">
        Payment history
      </h2>
      {payments.isPending ? (
        <p className="mt-2 text-sm text-dim">Loading...</p>
      ) : payments.isError ? (
        <Err text={plainErrorMessage(payments.error)} />
      ) : payments.data.length === 0 ? (
        <p className="mt-2 text-sm text-dim">No payments recorded yet.</p>
      ) : (
        <ul aria-label="Payments" className="mt-2 divide-y divide-border">
          {payments.data.map((p) => (
            <li key={p.id} className="flex flex-wrap gap-x-3 py-2 text-sm">
              <span className="text-text">{formatDay(p.paidOn)}</span>
              <span className="font-semibold text-text">{formatMoney(p.amount, p.currency)}</span>
              <span className="text-dim">{p.planName}</span>
              <span className="text-dim">{p.method}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-dim">Payments your coach recorded. Repsy doesn't take payments itself - ask your coach about receipts or anything that looks wrong.</p>
    </section>
  );
}

// ---------- delete ----------

function DeleteSection({ account }: { account: MyAccount }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [error, setError] = useState<{ field: "password" | "word"; text: string } | null>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) firstRef.current?.focus();
    else if (wasOpen.current) openRef.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const del = useMutation({
    mutationFn: () => deleteMyAccount(account.googleConnected ? { confirm: word } : { password, confirm: word }),
    onSuccess: () => {
      qc.clear();
      navigate("/client/login?deleted=1", { replace: true });
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!account.googleConnected && password === "") return setError({ field: "password", text: "Please enter your password." });
    if (word !== "DELETE") return setError({ field: "word", text: "Type DELETE in capital letters to confirm." });
    setError(null);
    del.mutate();
  }
  const invalid = (f: "password" | "word") => (error?.field === f ? { "aria-invalid": true as const, "aria-describedby": "del-error" } : {});
  return (
    <section aria-labelledby="del-h" className="mt-6 rounded-lg border border-accent p-4 text-left">
      <h2 id="del-h" className="card-title">
        Delete my account
      </h2>
      <p className="mt-1 text-sm text-dim">
        This permanently deletes your account and everything in it: plans, check-ins, habits, measurements, messages, and the
        membership and payment records your coach keeps for you. Your coach will no longer see you. This cannot be undone.
      </p>
      {!open ? (
        <button ref={openRef} type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 rounded-lg border border-accent px-4 text-sm font-semibold text-accent">
          Delete my account...
        </button>
      ) : (
        <form aria-label="Delete my account" noValidate onSubmit={submit} className="mt-3 grid gap-3 sm:max-w-sm">
          {account.googleConnected ? (
            <p className="text-sm text-text">
              For your safety,{" "}
              <a href="/api/client-auth/google/start" className="font-semibold text-accent2 underline underline-offset-4">
                sign in with Google again
              </a>
              , then come back here and delete within 5 minutes.
            </p>
          ) : (
            <div>
              <label htmlFor="del-password" className="mb-1 block text-sm font-semibold">
                Your password
              </label>
              <input
                id="del-password"
                ref={firstRef}
                {...invalid("password")}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          <div>
            <label htmlFor="del-word" className="mb-1 block text-sm font-semibold">
              Type DELETE to confirm
            </label>
            <input
              id="del-word"
              ref={account.googleConnected ? firstRef : undefined}
              {...invalid("word")}
              autoComplete="off"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className={inputClass}
            />
          </div>
          <Err id="del-error" text={error?.text ?? (del.isError ? plainErrorMessage(del.error) : null)} />
          <div className="flex gap-2">
            <button type="submit" disabled={del.isPending} className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-60">
              {del.isPending ? "Deleting..." : "Delete my account forever"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
                del.reset();
              }}
              className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Prompt 83 review: the waiting / declined screen also lets a client delete their account. */
export function PendingDelete() {
  const account = useQuery({ queryKey: queryKeys.myAccount, queryFn: getMyAccount });
  if (!account.data) return null;
  return <DeleteSection account={account.data} />;
}
