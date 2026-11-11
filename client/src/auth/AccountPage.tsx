// /app/account (Prompt 47): see your email, change your display name, change your password (needs the
// current one; other devices are signed out). No delete-account in v2.
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { changePassword, deleteAccount, queryKeys, updateCurrency, updateName } from "../api";
import { ChangePasswordSchema, UpdateNameSchema } from "../authSchemas";
import { plainErrorMessage } from "../components/States";
import { CURRENCIES, type Coach, type Currency } from "../types";
import { TextField, validate, type FieldErrors } from "./AuthPages";

function NameForm({ coach }: { coach: Coach }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(coach.name);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSaved(false);
    const found = validate(UpdateNameSchema, { name });
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      const updated = await updateName(UpdateNameSchema.parse({ name }).name);
      queryClient.setQueryData(queryKeys.me, updated);
      setName(updated.name);
      setSaved(true);
    } catch (err) {
      setServerError(plainErrorMessage(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Name settings" className="grid max-w-sm gap-4">
      <TextField id="account-name" label="Display name" autoComplete="name" value={name} onChange={setName} error={errors.name} />
      {serverError && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {serverError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm font-semibold text-accent2">
          Name saved.
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary min-h-11 justify-self-start rounded-lg px-5 text-sm disabled:opacity-60">
        {busy ? "Please wait..." : "Save name"}
      </button>
    </form>
  );
}

/** Prompt 68: the one currency plan prices and payments are shown in. */
function CurrencyForm({ coach }: { coach: Coach }) {
  const queryClient = useQueryClient();
  const [currency, setCurrency] = useState<Currency>(coach.currency ?? "INR");
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSaved(false);
    setBusy(true);
    try {
      const updated = await updateCurrency(currency);
      queryClient.setQueryData(queryKeys.me, updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.businessPlans });
      setSaved(true);
    } catch (err) {
      setServerError(plainErrorMessage(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Currency settings" className="grid max-w-sm gap-4">
      <div>
        <label htmlFor="account-currency" className="mb-1 block text-sm font-bold">
          Currency for plans and payments
        </label>
        <select
          id="account-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
          className="min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c === "INR" ? "INR - Indian rupee" : "USD - US dollar"}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-dim">Amounts are not converted: this only changes how they are shown.</p>
      </div>
      {serverError && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {serverError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm font-semibold text-accent2">
          Currency saved.
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary min-h-11 justify-self-start rounded-lg px-5 text-sm disabled:opacity-60">
        {busy ? "Please wait..." : "Save currency"}
      </button>
    </form>
  );
}

/** What the app holds and how to get rid of it (Prompt 73), in plain words. */
function DataNote() {
  return (
    <div className="max-w-prose text-sm text-dim">
      <p>
        Repsy Coach stores your account (name, email and a one-way hash of your password, never the password
        itself) and the records you enter: your clients and their notes, programmes and templates, progress
        logs, measurements, check-ins, habits, messages, appointments, and the plans and payments you record
        by hand. No card or bank details are stored, because the app does not take payments.
      </p>
      <p className="mt-2">
        Only you can see your clients. A client you invite sees only their own plan, sessions, messages and
        streaks &mdash; never your notes, and never another client.
      </p>
      <p className="mt-2">
        You can take your data with you at any time: <strong>Business &rarr; Reports</strong> exports CSV files
        for a client, and a roster CSV for everyone. Deleting a single client from the Clients tab removes that
        client and all of their records. Deleting your account below removes everything.
      </p>
      <p className="mt-2">
        More detail is on the{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-text">
          Privacy page
        </a>
        .
      </p>
    </div>
  );
}

/**
 * Deleting the account: the password plus the typed word DELETE, so neither a mis-click nor a
 * borrowed screen can do it. The server checks both again.
 */
function DeleteAccountForm() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = confirm === "DELETE" && password.length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!ready) return;
    setBusy(true);
    try {
      await deleteAccount(password);
      // Everything is gone: leave the app entirely rather than re-fetching into a dead session.
      window.location.replace("/");
      return;
    } catch (err) {
      setServerError(plainErrorMessage(err));
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="max-w-prose">
        <p className="text-sm text-dim">
          Deleting your account removes you, all of your clients, and every record above. It cannot be undone.
          Export anything you want to keep first.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 min-h-11 rounded-lg border border-border bg-surface2 px-4 text-sm font-semibold text-text hover:border-dim"
        >
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Delete account" className="grid max-w-sm gap-4">
      <p className="text-sm font-semibold text-amber-text">
        This deletes you, your clients and all of their records. It cannot be undone.
      </p>
      <div>
        <label htmlFor="delete-password" className="mb-1 block text-sm font-bold">
          Your password
        </label>
        <input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text"
        />
      </div>
      <div>
        <label htmlFor="delete-confirm" className="mb-1 block text-sm font-bold">
          Type DELETE to confirm
        </label>
        <input
          id="delete-confirm"
          value={confirm}
          autoComplete="off"
          onChange={(e) => setConfirm(e.target.value)}
          className="min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text"
        />
      </div>
      {serverError && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {serverError}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !ready}
          className="min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-60"
        >
          {busy ? "Deleting..." : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPassword("");
            setConfirm("");
            setServerError(null);
          }}
          className="min-h-11 rounded-lg px-4 text-sm text-dim hover:text-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSaved(false);
    const values = { currentPassword, newPassword };
    const found = validate(ChangePasswordSchema, values);
    setErrors(found ?? {});
    if (found) return;
    setBusy(true);
    try {
      await changePassword(ChangePasswordSchema.parse(values));
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
    } catch (err) {
      setServerError(plainErrorMessage(err));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Password settings" className="grid max-w-sm gap-4">
      <TextField
        id="account-current-password"
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={setCurrentPassword}
        error={errors.currentPassword}
      />
      <TextField
        id="account-new-password"
        label="New password"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
        error={errors.newPassword}
      />
      {serverError && (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {serverError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm font-semibold text-accent2">
          Password changed. Your other devices have been signed out.
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary min-h-11 justify-self-start rounded-lg px-5 text-sm disabled:opacity-60">
        {busy ? "Please wait..." : "Change password"}
      </button>
    </form>
  );
}

export default function AccountPage({ coach }: { coach: Coach }) {
  return (
    <div className="grid gap-8">
      <h2 className="text-2xl">Account</h2>
      <section>
        <h3 className="text-base">Email</h3>
        <p className="mt-1 text-sm text-dim" data-testid="account-email">
          {coach.email}
        </p>
        <p className="mt-1 text-xs text-dim">This is the address you log in with. It can't be changed here.</p>
      </section>
      <section className="grid gap-3">
        <h3 className="text-base">Name</h3>
        <NameForm coach={coach} />
      </section>
      <section className="grid gap-3">
        <h3 className="text-base">Currency</h3>
        <CurrencyForm coach={coach} />
      </section>
      <section className="grid gap-3">
        <h3 className="text-base">Password</h3>
        <PasswordForm />
      </section>
      <section className="grid gap-3">
        <h3 className="text-base">Your data</h3>
        <DataNote />
      </section>
      <section className="grid gap-3">
        <h3 className="text-base">Delete account</h3>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
