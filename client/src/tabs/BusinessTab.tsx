// Business tab (Prompt 68): client plans and payments the coach records by hand.
// RECORD-KEEPING ONLY: nothing here charges a card, sends a payment link or a reminder, or makes an
// invoice. The help line under the heading says so.
import { lazy, Suspense, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { downloadRosterCsv, getBusinessPlans, queryKeys, recordPayment, saveClientPlan } from "../api";
import { Engagement } from "../components/Engagement";
import { Schedule } from "../components/Schedule";
import { ErrorState, LoadingState, plainErrorMessage } from "../components/States";
import { localToday } from "./AiCoachTab";
import {
  BILLING_CYCLES,
  PAYMENT_METHODS,
  PLAN_STATUSES,
  type BillingCycle,
  type BusinessPlanRow,
  type Client,
  type ClientPlan,
  type PaymentMethod,
  type PlanStatus,
} from "../types";

export const FILTERS = ["All", "Overdue", "Due this week", "Active"] as const;
type Filter = (typeof FILTERS)[number];
const DUE_SOON_DAYS = 7;

/** Whole days from today to `due` (negative = overdue). */
export function daysUntil(due: string, today: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Overdue / due soon only mean something for an Active plan. */
function dueState(plan: ClientPlan, today: string): "overdue" | "soon" | "later" | "inactive" {
  if (plan.status !== "Active") return "inactive";
  const d = daysUntil(plan.nextDueDate, today);
  return d < 0 ? "overdue" : d <= DUE_SOON_DAYS ? "soon" : "later";
}

function matches(filter: Filter, plan: ClientPlan, today: string): boolean {
  const state = dueState(plan, today);
  if (filter === "Overdue") return state === "overdue";
  if (filter === "Due this week") return state === "soon";
  if (filter === "Active") return plan.status === "Active";
  return true;
}

/** Formats an amount in the coach's currency (the data stores a number and an ISO code, never a symbol). */
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const dayText = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { dateStyle: "medium" });

const VIEWS = ["Payments", "Schedule", "Engagement", "Reports"] as const;
type View = (typeof VIEWS)[number];

// Reports (Prompt 70) holds Recharts, so it loads on first open like the other chart tabs.
const Reports = lazy(() => import("../components/Reports").then((m) => ({ default: m.Reports })));

// Prompt 69: the Business tab has a view switch (Payments / Schedule / Reports). It stays one
// tab: the switch is inside the tab, so there is no 10th tab.
export function BusinessTab({ clients }: { clients: Client[] }) {
  const [view, setView] = useState<View>("Payments");
  return (
    <>
      {/* Printing a report prints only the report: the heading and view switch stay on screen. */}
      <h2 className="no-print text-2xl">Business</h2>
      <div role="group" aria-label="Business view" className="no-print mt-3 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={
              "min-h-10 rounded-full border px-4 text-sm font-semibold " +
              (view === v ? "border-text bg-text text-bg" : "border-border bg-surface2 text-text hover:border-dim")
            }
          >
            {v}
          </button>
        ))}
      </div>
      {view === "Payments" ? (
        <PaymentsView clients={clients} />
      ) : view === "Schedule" ? (
        <Schedule clients={clients} />
      ) : view === "Engagement" ? (
        <Engagement />
      ) : (
        <Suspense fallback={<LoadingState />}>
          <Reports clients={clients} />
        </Suspense>
      )}
    </>
  );
}

function PaymentsView({ clients }: { clients: Client[] }) {
  const today = localToday();
  const query = useQuery({ queryKey: queryKeys.businessPlans, queryFn: getBusinessPlans });
  const [filter, setFilter] = useState<Filter>("All");
  const [adding, setAdding] = useState(false);

  const rows = query.data?.plans ?? [];
  // Most urgent first: overdue, due soon, later, then Paused / Ended (by next due date within each).
  const shown = useMemo(() => {
    const rank = { overdue: 0, soon: 1, later: 2, inactive: 3 } as const;
    return rows
      .filter((r) => matches(filter, r.plan, today))
      .sort((a, b) => rank[dueState(a.plan, today)] - rank[dueState(b.plan, today)] || a.plan.nextDueDate.localeCompare(b.plan.nextDueDate));
  }, [rows, filter, today]);
  const withoutPlan = clients.filter((c) => !rows.some((r) => r.client.id === c.id));
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f, rows.filter((r) => matches(f, r.plan, today)).length])) as Record<Filter, number>,
    [rows, today],
  );

  const roster = useMutation({ mutationFn: downloadRosterCsv });

  return (
    <>
      <div className="mt-3 flex flex-wrap items-baseline justify-end gap-3">
        <button
          type="button"
          disabled={roster.isPending}
          onClick={() => roster.mutate()}
          className="min-h-11 rounded-lg border border-border bg-surface2 px-4 text-sm font-semibold text-text hover:border-dim disabled:opacity-60"
        >
          Download roster CSV
        </button>
        {!adding && withoutPlan.length > 0 && query.data && (
          <button type="button" onClick={() => setAdding(true)} className="btn-primary min-h-11 rounded-lg px-4 text-sm">
            Add a plan
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-dim">
        Record-keeping only: log the payments your clients make you. Nothing here charges anyone, sends payment links or
        reminders, or makes invoices. Export a client's data from Reports.
      </p>
      {roster.isError && (
        <p role="alert" className="mt-2 text-sm font-semibold text-amber-text">
          {plainErrorMessage(roster.error)}
        </p>
      )}

      {query.isPending || (query.isError && query.isFetching) ? (
        <div className="mt-4">
          <LoadingState />
        </div>
      ) : query.isError ? (
        <div className="mt-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <>
          {adding && (
            <PlanForm
              currency={query.data.currency}
              clients={withoutPlan}
              onDone={() => setAdding(false)}
            />
          )}

          <div role="group" aria-label="Filter plans" className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={
                  "min-h-10 rounded-full border px-3 text-sm font-semibold " +
                  (filter === f ? "border-text bg-text text-bg" : "border-border bg-surface2 text-text hover:border-dim")
                }
              >
                {f} <span className="font-mono font-normal">{counts[f]}</span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="card mt-4 p-6 text-center text-dim">
              No plans yet. Add a plan to start recording payments.
            </div>
          ) : shown.length === 0 ? (
            <div className="card mt-4 p-6 text-center text-dim">No plans match "{filter}".</div>
          ) : (
            <ul aria-label="Client plans" className="mt-4 space-y-3">
              {shown.map((row) => (
                <PlanRow key={row.plan.id} row={row} currency={query.data.currency} today={today} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

function DueText({ plan, today }: { plan: ClientPlan; today: string }) {
  const state = dueState(plan, today);
  const d = daysUntil(plan.nextDueDate, today);
  if (state === "overdue") {
    // Overdue: dark text on the brand orange - the palette has no red, and this pairing is readable.
    return (
      <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-on-accent">
        {-d === 1 ? "1 day overdue" : `${-d} days overdue`}
      </span>
    );
  }
  if (state === "soon") {
    return <span className="text-sm font-bold text-amber-text">{d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`}</span>;
  }
  // Paused / Ended plans are not "due": show the stored date plainly, without urgency.
  if (state === "inactive") return <span className="text-xs text-dim">Next due date {dayText(plan.nextDueDate)}</span>;
  return <span className="text-sm text-dim">Due {dayText(plan.nextDueDate)}</span>;
}

function PlanRow({ row, currency, today }: { row: BusinessPlanRow; currency: string; today: string }) {
  const { client, plan, lastPayment } = row;
  const [open, setOpen] = useState<"pay" | "edit" | null>(null);
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-semibold text-text">{client.name}</p>
          <p className="text-sm text-dim">
            {plan.planName} · {plan.billingCycle} ·{" "}
            <span className="font-mono text-text">{money(plan.priceAmount, currency)}</span>
          </p>
          <p className="mt-1 text-xs text-dim">
            {lastPayment ? `Last payment ${money(lastPayment.amount, currency)} on ${dayText(lastPayment.paidOn)}` : "No payments recorded yet"}
          </p>
        </div>
        {/* Phones: this column wraps under the name, so it lines up on the left there. */}
        <div className="flex flex-col items-start gap-1 text-left sm:items-end sm:text-right">
          <span className="rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-semibold text-text">{plan.status}</span>
          <DueText plan={plan} today={today} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        {plan.status !== "Ended" && (
          <button
            type="button"
            aria-expanded={open === "pay"}
            onClick={() => setOpen(open === "pay" ? null : "pay")}
            className="min-h-10 rounded-lg border border-border bg-surface2 px-3 text-sm font-semibold text-text hover:border-dim"
          >
            Record payment
          </button>
        )}
        <button
          type="button"
          aria-expanded={open === "edit"}
          onClick={() => setOpen(open === "edit" ? null : "edit")}
          className="min-h-10 rounded-lg px-3 text-sm text-dim underline-offset-2 hover:text-text hover:underline"
        >
          Edit plan
        </button>
      </div>
      {open === "pay" && <PaymentForm row={row} currency={currency} today={today} onDone={() => setOpen(null)} />}
      {open === "edit" && (
        <PlanForm currency={currency} clients={[]} existing={row} onDone={() => setOpen(null)} />
      )}
    </li>
  );
}

const inputClass = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-text";
const labelClass = "mb-1 block text-sm font-bold";

function PaymentForm({ row, currency, today, onDone }: { row: BusinessPlanRow; currency: string; today: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(row.plan.priceAmount));
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [note, setNote] = useState("");
  const save = useMutation({
    // A blank box is sent as missing (not 0), so the server says "Please enter the amount."
    mutationFn: () =>
      recordPayment(row.client.id, { amount: (amount.trim() === "" ? undefined : Number(amount)) as number, paidOn, method, note: note.trim() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.businessPlans });
      onDone();
    },
  });
  const nextAfter =
    row.plan.billingCycle === "One-time"
      ? "One-time plan: the due date stays the same."
      : row.plan.status === "Paused"
        ? "This plan is paused: the payment is recorded and the due date stays the same."
        : `Saving moves the next due date on by one ${row.plan.billingCycle.toLowerCase()} cycle.`;
  return (
    <form
      aria-label={`Record payment for ${row.client.name}`}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className="mt-3 grid gap-3 rounded-lg bg-surface2 p-3 sm:grid-cols-2"
    >
      <div>
        <label htmlFor={`pay-amount-${row.plan.id}`} className={labelClass}>
          Amount ({currency})
        </label>
        <input id={`pay-amount-${row.plan.id}`} type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`pay-date-${row.plan.id}`} className={labelClass}>
          Paid on
        </label>
        <input id={`pay-date-${row.plan.id}`} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`pay-method-${row.plan.id}`} className={labelClass}>
          Method
        </label>
        <select id={`pay-method-${row.plan.id}`} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputClass}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`pay-note-${row.plan.id}`} className={labelClass}>
          Note (optional)
        </label>
        <input id={`pay-note-${row.plan.id}`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </div>
      <p className="text-xs text-dim sm:col-span-2">{nextAfter}</p>
      {save.isError && (
        <p role="alert" className="text-sm font-semibold text-amber-text sm:col-span-2">
          {plainErrorMessage(save.error)}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={save.isPending} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
          {save.isPending ? "Saving..." : "Save payment"}
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-lg px-4 text-sm text-dim hover:text-text">
          Cancel
        </button>
      </div>
    </form>
  );
}

function PlanForm({
  currency,
  clients,
  existing,
  onDone,
}: {
  currency: string;
  /** Clients without a plan (for a new plan). */
  clients: Client[];
  existing?: BusinessPlanRow;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const today = localToday();
  const p = existing?.plan;
  const [clientId, setClientId] = useState(existing?.client.id ?? clients[0]?.id ?? "");
  const [planName, setPlanName] = useState(p?.planName ?? "Monthly coaching");
  const [price, setPrice] = useState(p ? String(p.priceAmount) : "");
  const [cycle, setCycle] = useState<BillingCycle>((p?.billingCycle as BillingCycle) ?? "Monthly");
  const [startDate, setStartDate] = useState(p?.startDate ?? today);
  const [nextDueDate, setNextDueDate] = useState(p?.nextDueDate ?? "");
  const [status, setStatus] = useState<PlanStatus>((p?.status as PlanStatus) ?? "Active");
  const id = existing ? existing.plan.id : "new";

  const save = useMutation({
    mutationFn: () =>
      saveClientPlan(clientId, {
        planName: planName.trim(),
        priceAmount: (price.trim() === "" ? undefined : Number(price)) as number,
        billingCycle: cycle,
        startDate,
        // Only when the coach set or changed it: resending the date loaded with the form would undo
        // a payment recorded meanwhile (on another device) that moved it on.
        ...(nextDueDate && nextDueDate !== p?.nextDueDate ? { nextDueDate } : {}),
        status,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.businessPlans });
      onDone();
    },
  });

  return (
    <form
      aria-label={existing ? `Edit plan for ${existing.client.name}` : "Add a plan"}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
      className={(existing ? "mt-3 bg-surface2 " : "card mt-4 ") + "grid gap-3 rounded-lg p-4 sm:grid-cols-2"}
    >
      {!existing && (
        <div className="sm:col-span-2">
          <label htmlFor="plan-client" className={labelClass}>
            Client
          </label>
          <select id="plan-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor={`plan-name-${id}`} className={labelClass}>
          Plan name
        </label>
        <input id={`plan-name-${id}`} value={planName} maxLength={100} onChange={(e) => setPlanName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`plan-price-${id}`} className={labelClass}>
          Price ({currency})
        </label>
        <input id={`plan-price-${id}`} type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`plan-cycle-${id}`} className={labelClass}>
          Billing cycle
        </label>
        <select id={`plan-cycle-${id}`} value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)} className={inputClass}>
          {BILLING_CYCLES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`plan-status-${id}`} className={labelClass}>
          Status
        </label>
        <select id={`plan-status-${id}`} value={status} onChange={(e) => setStatus(e.target.value as PlanStatus)} className={inputClass}>
          {PLAN_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`plan-start-${id}`} className={labelClass}>
          Start date
        </label>
        <input id={`plan-start-${id}`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`plan-next-${id}`} className={labelClass}>
          Next due date {existing ? "" : "(optional)"}
        </label>
        <input id={`plan-next-${id}`} type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} className={inputClass} />
        {!existing && <p className="mt-1 text-xs text-dim">Leave empty to use the start date.</p>}
      </div>
      {save.isError && (
        <p role="alert" className="text-sm font-semibold text-amber-text sm:col-span-2">
          {plainErrorMessage(save.error)}
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={save.isPending || !clientId} className="btn-primary min-h-11 rounded-lg px-5 text-sm disabled:opacity-60">
          {save.isPending ? "Saving..." : existing ? "Save plan" : "Add plan"}
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-lg px-4 text-sm text-dim hover:text-text">
          Cancel
        </button>
      </div>
    </form>
  );
}
