// The coach's own plan (owner, Nov 2026): what they are on, how much of it they are using, and how
// to move up.
//
// Pricing is by client count. Everyone is free forever with 2 clients; paying raises the limit and
// nothing else. So this screen never threatens anyone: there is no trial running out and no access
// to lose. The worst it says is "you are full, here is how to fit more".
//
// The PayPal SDK is the only third-party script in the coach app and it is loaded HERE, on demand -
// a coach who never opens this screen never fetches it. The subscription it returns is verified
// server-side before anything is believed (src/routes/billing.ts).
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelPlan,
  confirmSubscription,
  downloadPaymentsCsv,
  getBilling,
  getPayments,
  queryKeys,
  type BillingMe,
  type PlanOption,
} from "../api";
import { LoadingState } from "../components/States";
import { ConfirmDialog } from "../components/ConfirmDialog";

/** "14 December 2026" - the date a coach will recognise on their statement. */
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

const clientWord = (n: number) => `${n} ${n === 1 ? "client" : "clients"}`;

/** Typed to confirm a cancellation. Short and obvious: this is a speed bump, not a puzzle. */
const CONFIRM_WORD = "CANCEL";

type PayPalButtons = {
  Buttons: (config: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void> };
};
declare global {
  interface Window {
    paypal?: PayPalButtons;
  }
}

/** Loads the PayPal SDK once per page, and resolves with it. */
function loadPaypal(clientId: string): Promise<PayPalButtons> {
  if (window.paypal) return Promise.resolve(window.paypal);
  const existing = document.querySelector<HTMLScriptElement>("script[data-paypal-sdk]");
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => (window.paypal ? resolve(window.paypal) : reject(new Error("no sdk"))));
      existing.addEventListener("error", () => reject(new Error("PayPal could not be reached.")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // vault=true and intent=subscription make this a subscription button. The client id is public.
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription`;
    script.dataset.paypalSdk = "true";
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal did not load.")));
    script.onerror = () => reject(new Error("PayPal could not be reached. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

function PayButton({
  planId,
  clientId,
  customId,
  tier,
  onApproved,
}: {
  planId: string;
  clientId: string;
  customId: string;
  tier: string;
  onApproved: (subscriptionId: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const el = box.current;
    if (!el) return;
    el.innerHTML = "";
    loadPaypal(clientId)
      .then((paypal) => {
        if (cancelled || !box.current) return;
        return paypal
          .Buttons({
            style: { shape: "pill", color: "blue", layout: "vertical", label: "subscribe" },
            createSubscription: (_d: unknown, actions: { subscription: { create: (o: unknown) => Promise<string> } }) =>
              // custom_id ties the subscription to this coach inside PayPal itself.
              actions.subscription.create({ plan_id: planId, custom_id: customId }),
            onApprove: (data: { subscriptionID?: string }) => {
              if (data.subscriptionID) onApproved(data.subscriptionID);
            },
            onError: () => setError("PayPal could not start the checkout. Please try again."),
          })
          .render(box.current);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [planId, clientId, customId, onApproved]);

  return (
    <div className="grid gap-2">
      <div ref={box} data-testid={`paypal-button-${tier}`} aria-label={`Subscribe to ${clientWord(Number(tier))} with PayPal`} />
      {error ? (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Where they are: the plan, and how much of it is used. */
function StatusCard({ billing }: { billing: BillingMe }) {
  const full = billing.clientsUsed >= billing.clientLimit;
  return (
    <div
      className={`rounded-xl border p-4 ${full || billing.status === "past_due" ? "border-amber" : "border-border"} bg-surface2`}
      data-testid="billing-status"
    >
      <p className="font-semibold text-text">
        {billing.isFree ? `You are on the free plan: ${clientWord(billing.clientLimit)}.` : `You are on the ${clientWord(billing.clientLimit)} plan, $${billing.price} a month.`}
      </p>
      <p className="mt-1 text-sm text-dim">
        {billing.clientsUsed} of {billing.clientLimit} used.
        {full ? " Move up a plan to add more - everything you have stays exactly as it is." : ""}
      </p>
      {billing.message ? <p className="mt-2 text-sm text-dim">{billing.message}</p> : null}
      {billing.renewsOn && !billing.isFree ? (
        <p className="mt-1 text-sm text-dim">Renews on {longDate(billing.renewsOn)}.</p>
      ) : null}
    </div>
  );
}

/** The moment after paying: say it plainly, with the facts that make it real. */
function JustSubscribed({ billing, onDone }: { billing: BillingMe; onDone: () => void }) {
  const { data } = useQuery({ queryKey: queryKeys.billingPayments, queryFn: getPayments });
  return (
    <div className="rounded-xl border border-accent bg-surface2 p-5" data-testid="billing-welcome" role="status">
      <h3 className="card-title">You are on the {clientWord(billing.clientLimit)} plan. Welcome aboard.</h3>
      <p className="mt-2 text-sm text-dim">
        Your payment of ${billing.price} went through
        {billing.renewsOn ? `, and it renews on ${longDate(billing.renewsOn)}.` : "."} PayPal emails you a receipt.
      </p>
      <p className="mt-2 text-sm text-dim">
        Every feature was already yours - this only raises how many clients you can coach here. Cancel any time and you
        keep every one of them.
      </p>
      {data?.reference ? (
        <p className="mt-3 text-sm text-dim">
          Reference <span className="font-mono">{data.reference}</span> - quote this if you ever need to ask about a
          payment.
        </p>
      ) : null}
      <button type="button" className="btn btn-primary mt-4 min-h-10" onClick={onDone}>
        Back to coaching
      </button>
    </div>
  );
}

/** Every payment PayPal has taken, with the ids that prove it. */
function Payments() {
  const { data, isPending } = useQuery({ queryKey: queryKeys.billingPayments, queryFn: getPayments });
  const csv = useMutation({ mutationFn: downloadPaymentsCsv });
  if (isPending || !data?.reference) return null;

  return (
    <section className="grid gap-3" data-testid="billing-payments">
      <h3 className="card-title">Payments</h3>
      <p className="text-sm text-dim">
        Subscription reference <span className="font-mono">{data.reference}</span>. PayPal holds the money and emails
        you a receipt for each payment; this is the same record.
      </p>
      {data.payments.length === 0 ? (
        <p className="text-sm text-dim">No payments have been taken yet.</p>
      ) : (
        <ul className="grid gap-2">
          {data.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border p-3">
              <span className="font-semibold text-text">
                {p.currency === "USD" ? "$" : ""}
                {p.amount} {p.currency !== "USD" ? p.currency : ""}
              </span>
              <span className="text-sm text-dim">{longDate(p.time)}</span>
              <span className="text-sm text-dim">{p.status === "COMPLETED" ? "Paid" : p.status}</span>
              <span className="ml-auto font-mono text-xs text-dim">{p.id}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-secondary min-h-10 justify-self-start"
        disabled={csv.isPending || data.payments.length === 0}
        onClick={() => csv.mutate()}
      >
        {csv.isPending ? "Preparing..." : "Download payments (CSV)"}
      </button>
      {csv.isError ? (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {(csv.error as Error).message}
        </p>
      ) : null}
    </section>
  );
}

export default function BillingPage() {
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(null);
  const [justSubscribed, setJustSubscribed] = useState(false);
  // Cancelling is deliberate, not a stray click: a modal, and the word typed out.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [typed, setTyped] = useState("");
  const billingQuery = useQuery({ queryKey: queryKeys.billing, queryFn: getBilling });

  const confirm = useMutation({
    mutationFn: confirmSubscription,
    onSuccess: (fresh) => {
      qc.setQueryData(queryKeys.billing, fresh);
      void qc.invalidateQueries({ queryKey: queryKeys.billingPayments });
      setChosen(null);
      setJustSubscribed(true);
    },
  });
  const cancel = useMutation({
    mutationFn: cancelPlan,
    onSuccess: (fresh) => {
      qc.setQueryData(queryKeys.billing, fresh);
      setConfirmingCancel(false);
      setTyped("");
    },
  });

  if (billingQuery.isPending) return <LoadingState />;
  // A response that is not billing data (an old server, a proxy, a test that mocks every call with
  // []) must not take the Account page down with it: the delete form and the password form live on
  // the same screen. Anything unrecognisable is treated as "could not load".
  const usable =
    !billingQuery.isError &&
    billingQuery.data &&
    typeof billingQuery.data === "object" &&
    Array.isArray((billingQuery.data as { catalogue?: unknown }).catalogue);
  // Quietly: this sits beside the name and password forms, so a billing hiccup must not shout over
  // the whole Account page or add a second alert for a screen reader.
  if (!usable)
    return (
      <div className="grid gap-2">
        <p className="text-sm text-dim">We could not load your plan just now. Nothing has changed.</p>
        <button type="button" className="btn btn-secondary min-h-10 justify-self-start" onClick={() => billingQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  const billing = billingQuery.data as BillingMe;

  if (justSubscribed && billing.status === "active") {
    return <JustSubscribed billing={billing} onDone={() => setJustSubscribed(false)} />;
  }

  const paidPlans: PlanOption[] = billing.catalogue.filter((p) => p.price > 0);

  return (
    <div className="grid gap-4">
      <StatusCard billing={billing} />

      {confirm.isPending ? <p className="text-sm text-dim">Confirming your subscription with PayPal...</p> : null}
      {confirm.isError ? (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {(confirm.error as Error).message} Nothing has been charged twice - reload this page to see where you stand.
        </p>
      ) : null}

      {billing.paypal ? (
        <section className="grid gap-3">
          <h3 className="card-title">{billing.isFree ? "Coach more clients" : "Change plan"}</h3>
          <p className="text-sm text-dim">
            Every feature is in every plan. You are paying for roster size, nothing else, and you can change or cancel
            any time.
          </p>
          {billing.paypal.environment === "sandbox" ? (
            <p className="text-sm text-dim">PayPal is in test mode: no real money moves.</p>
          ) : null}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paidPlans.map((plan) => {
              const planId = billing.paypal?.plans[plan.key];
              const picked = chosen === plan.key;
              const current = plan.key === billing.tier;
              // A plan smaller than their roster would be a downgrade they cannot use.
              const tooSmall = plan.clients < billing.clientsUsed;
              return (
                <li key={plan.key} className="rounded-xl border border-border p-4" data-testid={`plan-${plan.key}`}>
                  <p className="font-semibold text-text">{clientWord(plan.clients)}</p>
                  <p className="text-sm text-dim">${plan.price} a month</p>
                  {current ? (
                    <p className="mt-3 text-sm font-semibold text-text">Your plan</p>
                  ) : picked && planId && billing.paypal ? (
                    <div className="mt-3">
                      <PayButton
                        planId={planId}
                        clientId={billing.paypal.clientId}
                        customId={billing.paypal.customId}
                        tier={String(plan.clients)}
                        onApproved={(id) => confirm.mutate(id)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary mt-3 min-h-10 w-full"
                      disabled={!planId || tooSmall}
                      onClick={() => setChosen(plan.key)}
                    >
                      {tooSmall ? `Too small for ${clientWord(billing.clientsUsed)}` : `Choose ${plan.clients}`}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-dim">
            More than {billing.enterpriseFrom} clients?{" "}
            <a className="font-semibold text-accent2 underline underline-offset-4" href="mailto:hello@repsy.fit?subject=Coaching%20more%20than%20100%20clients">
              Email us
            </a>{" "}
            and we will sort something out.
          </p>
        </section>
      ) : (
        <p className="text-sm text-dim">
          Payments are not switched on yet. Nothing is being charged, and nothing you do here is limited.
        </p>
      )}

      <Payments />

      {!billing.isFree && billing.status !== "past_due" ? (
        <section className="grid gap-2">
          <h3 className="card-title">Cancel</h3>
          <p className="text-sm text-dim">
            You stay on this plan until the end of the period you have paid for, then go back to the free plan. You keep
            every client you have - the free plan just covers {billing.catalogue[0].clients} new ones.
          </p>
          <button
            type="button"
            className="btn btn-secondary min-h-10 justify-self-start"
            disabled={cancel.isPending}
            onClick={() => setConfirmingCancel(true)}
          >
            Cancel my plan
          </button>
          {confirmingCancel ? (
            <ConfirmDialog
              title="Cancel your plan?"
              confirmLabel="Cancel my plan"
              pendingLabel="Cancelling..."
              pending={cancel.isPending}
              onCancel={() => {
                if (cancel.isPending) return;
                setConfirmingCancel(false);
                setTyped("");
              }}
              onConfirm={() => typed.trim().toUpperCase() === CONFIRM_WORD && cancel.mutate()}
            >
              <div className="grid gap-3">
                <p className="text-sm">
                  You stay on the {clientWord(billing.clientLimit)} plan until{" "}
                  {billing.renewsOn ? longDate(billing.renewsOn) : "the end of the period you have paid for"}, then go
                  back to the free plan.
                </p>
                <p className="text-sm">
                  Nothing is deleted. You keep every client, plan and message you have - the free plan just covers{" "}
                  {billing.catalogue[0].clients} new clients after that, and your clients are never told.
                </p>
                <label className="grid gap-1 text-sm">
                  <span>
                    Type <span className="font-mono font-semibold text-text">{CONFIRM_WORD}</span> to confirm
                  </span>
                  <input
                    className="min-h-11 w-full rounded-lg border border-border bg-surface2 px-3 text-base text-text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    aria-label={`Type ${CONFIRM_WORD} to confirm`}
                  />
                </label>
                {typed.trim() !== "" && typed.trim().toUpperCase() !== CONFIRM_WORD ? (
                  <p className="text-sm text-dim">That does not match {CONFIRM_WORD}.</p>
                ) : null}
              </div>
            </ConfirmDialog>
          ) : null}
          {cancel.isError ? (
            <p role="alert" className="text-sm font-semibold text-amber-text">
              {(cancel.error as Error).message}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
