// Pricing (Prompt 41). Prices are the three published plans; feature lists use shipped v1
// features only. Client payments are NOT live - shown as "coming soon".
const PLANS = [
  {
    name: "Solo",
    price: 39,
    clients: "Up to 30 clients",
    features: [
      "AI Coach answers with each client's context",
      "Suggested plans with reasoning - you approve each one",
      "Auto-assign Workout, Nutrition, Habit and Recovery plans",
      "Manual Planner with exercise library, sets, reps and rest",
      "Weekly check-ins and progress charts",
    ],
  },
  {
    name: "Pro",
    price: 89,
    clients: "Client limit to be announced",
    features: ["Everything in Solo"],
  },
  {
    name: "Studio",
    price: 199,
    clients: "Client limit to be announced",
    features: ["Everything in Pro"],
  },
];

export default function Pricing() {
  return (
    <>
      <p className="landing-dim mt-4 max-w-2xl text-lg">Every plan starts with a 7-day free trial.</p>
      <div className="mt-10 grid gap-8 md:grid-cols-3">
        {PLANS.map((plan) => (
          <article key={plan.name} className="l-rule flex flex-col pt-5" aria-labelledby={`plan-${plan.name}`} data-testid="plan">
            <h3 id={`plan-${plan.name}`} className="text-2xl">
              {plan.name}
            </h3>
            <p className="mt-3">
              <span className="l-num" style={{ color: "#141414" }}>
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
      <p className="landing-dim mt-8 text-sm">Client payments: coming soon.</p>
    </>
  );
}
