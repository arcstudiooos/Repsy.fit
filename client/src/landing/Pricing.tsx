// Pricing. Plan names, client limits and prices come from the single shared list in
// landing-new/content.ts (FREE_PLAN + PLAN_STEPS), which mirrors server/src/billing/plans.ts - so
// the public page can never disagree with Account/Billing. The model: free forever for 2 clients,
// then one price per roster size. There is no trial to expire. Client payments (coaches charging
// their own clients) are NOT live - shown as "coming soon".
import { FREE_PLAN, PLAN_STEPS } from "../landing-new/content";

const PLANS = [
  {
    id: "Starter",
    name: FREE_PLAN.name,
    price: FREE_PLAN.price,
    clients: `Up to ${FREE_PLAN.clients} clients, free forever`,
    features: FREE_PLAN.features,
  },
  ...PLAN_STEPS.map((s) => ({
    id: s.key,
    name: `Pro ${s.clients}`,
    price: s.price,
    clients: `Up to ${s.clients} clients`,
    features: ["Everything in Starter - no feature is ever locked"],
  })),
];

export default function Pricing() {
  return (
    <>
      <p className="landing-dim mt-4 max-w-2xl text-lg">Free forever for your first 2 clients - no card, no trial to expire. Paying only raises your client limit; every feature is in every plan.</p>
      <div className="mt-10 grid gap-8 md:grid-cols-3">
        {PLANS.map((plan) => (
          <article key={plan.id} className="l-rule flex flex-col pt-5" aria-labelledby={`plan-${plan.id}`} data-testid="plan">
            <h3 id={`plan-${plan.id}`} className="text-2xl">
              {plan.name}
            </h3>
            <p className="mt-3">
              <span className="l-num tabular-nums" style={{ color: "#141414" }}>
                ${plan.price}
              </span>
              <span className="landing-dim ml-1 font-semibold">/mo</span>
            </p>
            <p className="mt-2 text-sm font-bold">{plan.clients}</p>
            <ul className="landing-dim mt-4 flex flex-col gap-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden="true" style={{ color: "#ff4a1f" }}>
                    ■
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <a href="#start" className="btn-primary mt-6 flex min-h-11 items-center justify-center rounded-lg px-4 text-sm">
              Start free with {plan.name}
            </a>
          </article>
        ))}
      </div>
      <p className="landing-dim mt-8 text-sm">More than 100 clients? Email us and we'll fit a plan to your studio. Client payments: coming soon.</p>
    </>
  );
}
