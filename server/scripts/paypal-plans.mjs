// Creates the Repsy product and its three subscription plans in PayPal (Nov 2026).
//
// Why a script and not the dashboard wizard: the same plans have to exist in sandbox AND live, with
// identical prices and settings, and the wizard is six passes of forms where one mistyped field
// silently changes what a coach is charged. This is also the record of what those plans ARE.
//
// Run it once per environment, from the server directory:
//
//   node --env-file=.env scripts/paypal-plans.mjs
//
// It reads PAYPAL_ENV ("sandbox" or "live"), PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, prints the
// plan ids, and changes nothing that already exists: re-running it is safe and reports what it
// found. Plans in PayPal are immutable once created, so a price change means a NEW plan - never an
// edit (existing subscribers keep the plan they signed up on, which is the honest behaviour).
const ENV = process.env.PAYPAL_ENV ?? "sandbox";
const BASE = ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const ID = process.env.PAYPAL_CLIENT_ID;
const SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!ID || !SECRET) {
  console.error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set (server/.env). Nothing was sent.");
  process.exit(1);
}

const PRODUCT = {
  id: "REPSY-COACH",
  name: "Repsy Coach",
  description:
    "Coaching software for personal trainers: assign workout and nutrition plans with the AI's reasoning shown, track check-ins, habits and progress, and message clients in their own web app. Billed monthly, cancel any time.",
  type: "SERVICE",
  category: "SOFTWARE",
  home_url: "https://repsy.fit/pricing",
  image_url: "https://repsy.fit/repsy-logo-dark.png",
};

// Must stay in step with PLANS in client/src/landing-new/content.ts. The landing page and PayPal
// disagreeing about a price is the worst kind of bug: the coach sees one number and pays another.
// Must stay in step with PLANS in server/src/billing/plans.ts. The free tier has no PayPal plan:
// nobody subscribes to it.
const PLANS = [
  { tier: "Pro5", price: "17.00", clients: "Up to 5 clients" },
  { tier: "Pro10", price: "25.00", clients: "Up to 10 clients" },
  { tier: "Pro20", price: "45.00", clients: "Up to 20 clients" },
  { tier: "Pro50", price: "90.00", clients: "Up to 50 clients" },
  { tier: "Pro100", price: "150.00", clients: "Up to 100 clients" },
];

const auth = "Basic " + Buffer.from(`${ID}:${SECRET}`).toString("base64");

async function token() {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal refused the credentials (${res.status}). Check the keys and PAYPAL_ENV=${ENV}.`);
  return (await res.json()).access_token;
}

async function api(access, method, path, body, requestId) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
      // Idempotency: re-running the script does not create a second copy of anything.
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  return { ok: res.ok, status: res.status, json };
}

const access = await token();
console.log(`Connected to PayPal ${ENV}.`);

// ---- the product ----
let product = await api(access, "GET", `/v1/catalogs/products/${PRODUCT.id}`);
if (product.ok) {
  console.log(`Product ${PRODUCT.id} already exists.`);
} else {
  const made = await api(access, "POST", "/v1/catalogs/products", PRODUCT, `repsy-product-${PRODUCT.id}`);
  if (!made.ok) throw new Error(`Could not create the product: ${JSON.stringify(made.json)}`);
  console.log(`Product ${PRODUCT.id} created.`);
}

// ---- the plans ----
const existing = await api(access, "GET", `/v1/billing/plans?product_id=${PRODUCT.id}&page_size=20`);
const byName = new Map((existing.json.plans ?? []).map((p) => [p.name, p]));
const results = [];

for (const plan of PLANS) {
  const name = `Repsy Coach - ${plan.clients.replace("Up to ", "")}`;
  const found = byName.get(name);
  if (found) {
    results.push([plan.tier, found.id, found.status, "already existed"]);
    continue;
  }
  const body = {
    product_id: PRODUCT.id,
    name,
    description: `${plan.clients}. Every feature included. $${Number(plan.price)} per month.`,
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        // 0 = renews until cancelled. The 7 free days are granted by the app before a coach ever
        // reaches PayPal; a trial cycle here too would give some coaches 14 days.
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: plan.price, currency_code: "USD" } },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: "0", currency_code: "USD" },
      setup_fee_failure_action: "CONTINUE",
      // Three attempts before PayPal suspends: an expired card or a bank hold usually clears by
      // itself, and the app gives a 7-day grace period in parallel (src/billing/state.ts).
      payment_failure_threshold: 3,
    },
    taxes: { percentage: "0", inclusive: false },
  };
  const made = await api(access, "POST", "/v1/billing/plans", body, `repsy-plan-${ENV}-${plan.tier}`);
  if (!made.ok) throw new Error(`Could not create the ${plan.tier} plan: ${JSON.stringify(made.json)}`);
  results.push([plan.tier, made.json.id, made.json.status, "created"]);
}

console.log(`\nPlan ids for PAYPAL_PLAN_* in ${ENV}:\n`);
for (const row of results) {
  const [tier, id, status, what] = row;
  console.log(`  ${tier.padEnd(7)} ${id}  (${status}, ${what})`);
}
console.log("\nPut these in Render, one variable per plan:");
for (const row of results) console.log(`  PAYPAL_PLAN_${row[0].toUpperCase()}=${row[1]}`);
console.log("Plan ids are not secret - they appear in the checkout - so they are safe to paste anywhere.");
