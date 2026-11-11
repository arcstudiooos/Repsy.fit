// /app/account (Prompt 47): see your email, change your display name, change your password (needs the
// current one; other devices are signed out). No delete-account in v2.
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { changePassword, queryKeys, updateName } from "../api";
import { ChangePasswordSchema, UpdateNameSchema } from "../authSchemas";
import { plainErrorMessage } from "../components/States";
import type { Coach } from "../types";
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
        <h3 className="text-base">Password</h3>
        <PasswordForm />
      </section>
    </div>
  );
}
