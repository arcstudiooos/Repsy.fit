// The coach's own plan (Nov 2026): what they are on, what happens next, and how to pay.
//
// The PayPal SDK is the only third-party script in the coach app, and it is loaded HERE, on demand,
// never on app start: a coach who never opens this screen never fetches it. The button hands us a
// subscription id, which the server then checks with PayPal before believing a word of it
// (src/routes/billing.ts) - so nothing here can grant access by itself.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelPlan, confirmSubscription, getBilling, queryKeys, type BillingMe } from "../api";
import { LoadingState } from "../components/States";

/** "14 December 2026" - the date a coach will actually recognise on their statement. */
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

const TIERS = [
  { tier: "Solo", price: 39, clients: "Up to 30 clients" },
  { tier: "Pro", price: 89, clients: "Up to 100 clients" },
  { tier: "Studio", price: 199, clients: "No client limit" },
] as const;

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
    // vault=true and intent=subscription are what make this a subscription button rather than a
    // one-off payment. The client id is public.
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
  tier,
  onApproved,
}: {
  planId: string;
  clientId: string;
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
            createSubscription: (_data: unknown, actions: { subscription: { create: (o: unknown) => Promise<string> } }) =>
              actions.subscription.create({ plan_id: planId }),
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
  }, [planId, clientId, onApproved]);

  return (
    <div className="grid gap-2">
      <div ref={box} data-testid={`paypal-button-${tier}`} aria-label={`Subscribe to ${tier} with PayPal`} />
      {error ? <p role="alert" className="text-sm font-semibold text-amber-text">{error}</p> : null}
    </div>
  );
}

function StatusCard({ billing }: { billing: BillingMe }) {
  // Four states, four plain sentences. No badge a coach has to decode.
  const tone =
    billing.status === "read_only" || billing.status === "past_due"
      ? "border-amber bg-surface2"
      : "border-border bg-surface2";
  return (
    <div className={`rounded-xl border p-4 ${tone}`} data-testid="billing-status">
      <p className="font-semibold text-text">
        {billing.status === "active" && `You are on ${billing.tier}.`}
        {billing.status === "trialing" && `You are on a free trial of ${billing.tier}.`}
        {billing.status === "past_due" && "Your last payment did not go through."}
        {billing.status === "read_only" && "New plans are paused."}
      </p>
      {billing.message ? <p className="mt-1 text-sm text-dim">{billing.message}</p> : null}
      {!billing.canWrite ? (
        <p className="mt-2 text-sm text-dim">
          Everything you have is still here and still exportable, and your clients are unaffected.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The moment after paying. A coach has just handed over money and the old screen simply redrew
 * itself - so it felt like nothing had happened. This says it plainly, with the three facts that
 * make it feel real: what they are on, what was charged, and when it happens again.
 */
function JustSubscribed({ billing, onDone }: { billing: BillingMe; onDone: () => void }) {
  const price = TIERS.find((t) => t.tier === billing.tier)?.price;
  return (
    <div className="rounded-xl border border-accent bg-surface2 p-5" data-testid="billing-welcome" role="status">
      <h3 className="card-title">You're on {billing.tier}. Welcome aboard.</h3>
      <p className="mt-2 text-sm text-dim">
        {price ? `Your payment of $${price} went through` : "Your payment went through"}
        {billing.renewsOn ? `, and your plan renews on ${longDate(billing.renewsOn)}.` : "."} PayPal emails you a
        receipt.
      </p>
      <p className="mt-2 text-sm text-dim">
        Every feature is yours now - AI plans, the Manual Planner, templates, check-ins and progress charts - and you
        can cancel any time without losing a thing.
      </p>
      <button type="button" className="btn btn-primary mt-4 min-h-10" onClick={onDone}>
        Back to coaching
      </button>
    </div>
  );
}

export default function BillingPage() {
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(null);
  // Shown once, right after paying - not on every later visit to this page.
  const [justSubscribed, setJustSubscribed] = useState(false);
  const billingQuery = useQuery({ queryKey: queryKeys.billing, queryFn: getBilling });

  const confirm = useMutation({
    mutationFn: confirmSubscription,
    onSuccess: (fresh) => {
      qc.setQueryData(queryKeys.billing, fresh);
      setChosen(null);
      setJustSubscribed(true);
    },
  });
  const cancel = useMutation({
    mutationFn: cancelPlan,
    onSuccess: (fresh) => qc.setQueryData(queryKeys.billing, fresh),
  });

  if (billingQuery.isPending) return <LoadingState />;
  // Quietly. This section sits on the Account page beside the name and password forms, so a billing
  // hiccup must not shout "Something went wrong" over the whole page, and must not add a second
  // alert for a screen reader to announce.
  if (billingQuery.isError)
    return (
      <div className="grid gap-2">
        <p className="text-sm text-dim">We could not load your plan just now. Nothing has changed.</p>
        <button type="button" className="btn btn-secondary min-h-10 justify-self-start" onClick={() => billingQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  const billing = billingQuery.data;

  if (justSubscribed && billing.status === "active") {
    return <JustSubscribed billing={billing} onDone={() => setJustSubscribed(false)} />;
  }

  return (
    <div className="grid gap-4">
      <StatusCard billing={billing} />

      {confirm.isPending ? <p className="text-sm text-dim">Confirming your subscription with PayPal...</p> : null}
      {confirm.isError ? (
        <p role="alert" className="text-sm font-semibold text-amber-text">
          {(confirm.error as Error).message} Nothing has been charged twice - reload this page to see where you stand.
        </p>
      ) : null}

      {billing.needsSubscription && billing.paypal ? (
        <section className="grid gap-3">
          <h3 className="card-title">Choose a plan</h3>
          <p className="text-sm text-dim">
            Every feature is in every plan. The tiers differ only by how many clients you coach, and you can change or
            cancel any time.
          </p>
          {billing.paypal.environment === "sandbox" ? (
            <p className="text-sm text-dim">PayPal is in test mode: no real money moves.</p>
          ) : null}
          <ul className="grid gap-3 sm:grid-cols-3">
            {TIERS.map((t) => {
              const planId = billing.paypal?.plans[t.tier];
              const picked = chosen === t.tier;
              return (
                <li key={t.tier} className="rounded-xl border border-border p-4">
                  <p className="font-semibold text-text">{t.tier}</p>
                  <p className="text-sm text-dim">
                    ${t.price} per month · {t.clients}
                  </p>
                  {picked && planId && billing.paypal ? (
                    <div className="mt-3">
                      <PayButton
                        planId={planId}
                        clientId={billing.paypal.clientId}
                        tier={t.tier}
                        onApproved={(id) => confirm.mutate(id)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary mt-3 min-h-10 w-full"
                      disabled={!planId}
                      onClick={() => setChosen(t.tier)}
                    >
                      {planId ? `Choose ${t.tier}` : "Not available"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {billing.paypal === null ? (
        <p className="text-sm text-dim">
          Payments are not switched on yet. Nothing is being charged, and nothing you do here is limited.
        </p>
      ) : null}

      {!billing.needsSubscription && billing.status === "active" ? (
        <section className="grid gap-2">
          <h3 className="card-title">Cancel</h3>
          <p className="text-sm text-dim">
            You keep everything until the end of the period you have already paid for. Nothing is deleted, and your
            clients are not told.
          </p>
          <button
            type="button"
            className="btn btn-secondary min-h-10 justify-self-start"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? "Cancelling..." : "Cancel my plan"}
          </button>
          {cancel.isError ? <p role="alert" className="text-sm font-semibold text-amber-text">{(cancel.error as Error).message}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
