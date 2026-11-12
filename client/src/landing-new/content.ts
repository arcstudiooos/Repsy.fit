// Copy and sample data for the "Studio" landing (?design=new). Every claim here describes a
// shipped v2 feature. Sample people are the same made-up demo clients the app seeds (Maya, Arjun,
// Casey) plus Leo; no real person or customer is implied.

export const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Why Repsy", href: "#why" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

/** The hero barbell: Repsy's four plan types are the four plates (the app's own type colours), one
 * per client. Plates load innermost first; sizes follow real plate proportions. */
export const PLATES = [
  { type: "Workout", color: "var(--orange)", ink: "var(--ink)", client: "Maya", plan: "Push day · 4 moves", h: 1 },
  { type: "Nutrition", color: "var(--teal)", ink: "var(--paper)", client: "Arjun", plan: "Cut · 2,100 kcal", h: 0.86 },
  { type: "Habit", color: "var(--amber)", ink: "var(--ink)", client: "Casey", plan: "10k steps · 7 days", h: 0.72 },
  { type: "Recovery", color: "var(--violet)", ink: "var(--paper)", client: "Leo", plan: "Mobility · 2 × 20 min", h: 0.6 },
] as const;

/** The old way: five apps per client. Generic glyphs, no logos. */
export const TANGLE = [
  { icon: "list", name: "Sheets", x: 8, y: 6, r: -8, color: "var(--teal)", on: "var(--paper)" },
  { icon: "inbox", name: "Chat", x: 62, y: 2, r: 6, color: "var(--orange)", on: "var(--ink)" },
  { icon: "calendar", name: "Calendar", x: 70, y: 48, r: -5, color: "var(--violet)", on: "var(--paper)" },
  { icon: "chart", name: "Calculator", x: 10, y: 56, r: 7, color: "var(--amber)", on: "var(--ink)" },
  { icon: "doc", name: "Photos", x: 38, y: 30, r: -3, color: "var(--ink)", on: "var(--paper)" },
] as const;

export const RIBBON = "PLANS WITH THE WHY · CLIENTS NEED NO APP · SETS, REPS, REST · CHECK-INS THAT ADD UP · ";

export const ROAD = [
  {
    id: "ai",
    title: ["AI plans", "with the why"],
    body: "Ask about a client. The AI answers from their goal, level and check-ins, and every suggestion carries its reasoning. No AI plan reaches a client's list unless you choose it.",
    note: "you choose every one",
    icon: "spark",
  },
  {
    id: "dose",
    title: ["Sets, reps, rest,", "written down"],
    body: "Search the exercise library and set the dose for every move. It saves as a numbered plan, exactly as you wrote it, and as a template to reuse.",
    note: "no more \u201chow many sets?\u201d",
    icon: "list",
  },
  {
    id: "live",
    title: ["See the week", "at a glance"],
    body: "Mark plans Done as clients train. Home shows today's tasks, new check-ins and who needs attention, every time you open it.",
    note: "watch it fill up",
    icon: "pulse",
  },
  {
    id: "checkins",
    title: ["Check-ins", "that add up"],
    body: "Weight, adherence and workouts turn into charts on their own. A stall or a slipping week lands in Needs attention with the reason.",
    note: "who skipped leg day?",
    icon: "chart",
  },
] as const;

export const MORE = [
  { icon: "doc", tag: "Home", title: "Weekly AI summary", body: "One tap writes the week across every client from your own records. If the AI is down, you still get the facts." },
  { icon: "flame", tag: "Check-ins", title: "Habit streaks", body: "Up to eight habits per client, ticked daily, with a running streak so the good weeks show." },
  { icon: "inbox", tag: "Home", title: "Review queue", body: "New check-ins and the AI suggestions you park wait here. Approving a suggestion turns it into a real plan." },
  { icon: "calendar", tag: "Business", title: "Schedule", body: "A week of sessions and calls, stored once and shown in each viewer's own timezone." },
  { icon: "trophy", tag: "Business", title: "Engagement board", body: "Clients ranked by check-in streak, then habit %, with all three numbers shown. No black-box score." },
  { icon: "download", tag: "Business", title: "Reports and CSV", body: "A printable progress report per client, and CSV files for logs, measurements, payments and assigned plans." },
];

export const CHAOS = [
  { who: "Maya", text: "what's my workout today?" },
  { who: "Arjun", text: "did u get my weight from sunday" },
  { who: "Casey", text: "can i swap squats for leg press??", right: true },
  { who: "Leo", text: "which plan is this week, the pdf or the msg" },
  { who: "Maya", text: "also sent a pic of lunch" },
  { who: "Arjun", text: "paid u yesterday na?", right: true },
];

export const COMPARE = [
  "Every client's plan in one place",
  "The reasoning saved with each plan",
  "Check-ins become charts by themselves",
  "A sign-in for each client, scoped to them",
  "Plans, payments and due dates tracked",
  "A weekly summary written for you",
  "One-tap CSV export",
];

export const FEED = [
  ["Leg day", "Maya · marked Done · just now"],
  ["Check-in logged", "Arjun · 82% adherence · 2 min ago"],
  ["6-day streak", "Casey · Habits · 5 min ago"],
  ["Payment recorded", "Leo · Monthly coaching · 12 min ago"],
  ["Plan assigned", "Maya · Push day · 20 min ago"],
  ["Back on track", "Arjun · left Needs attention · 1 h ago"],
];

/** The old way, beat by beat (left column of the pinned notebook scene). */
export const BEATS = [
  { title: "The old way.", body: "Five apps for one client. A sheet, a chat, a calendar, a calculator and a camera roll." },
  { title: "Someone missed Thursday.", body: "The calendar says nothing. The chat says \u201csorry!\u201d. Nothing adds it up." },
  { title: "Now: is she actually progressing?", body: "Three screenshots, a calculator and a guess." },
  { title: "Enough.", body: "One place." },
];

export const PLANS = [
  {
    name: "Solo",
    price: 39,
    clients: "Up to 30 clients",
    features: [
      "AI Coach with each client's context",
      "Suggested plans with reasoning",
      "Manual Planner, templates and meals",
      "Check-ins, habits and progress charts",
      "Client message log, schedule and payment records",
    ],
  },
  { name: "Pro", price: 89, clients: "Client limit to be announced", features: ["Everything in Solo"], dark: true },
  { name: "Studio", price: 199, clients: "Client limit to be announced", features: ["Everything in Pro"] },
];

/** FAQ as a coaches' group chat. Answers describe v2 as it is today. */
export const FAQ_CHAT: { who: string; q: string; a: string }[] = [
  {
    who: "Priya",
    q: "Do my clients need to install anything?",
    a: "No. You invite a client from the Clients tab and they get a link. They set a password and see their membership, upcoming sessions and streaks in the browser.",
  },
  {
    who: "Dev",
    q: "Does the AI replace me?",
    a: "No. The AI suggests, you decide: no AI plan reaches a client until you assign it (as written or edited), and you can plan by hand instead. Its advice is general wellness only and can be wrong, so check every plan.",
  },
  {
    who: "Sam",
    q: "Can another coach see my clients?",
    a: "No. Every request is checked against your account, so you only ever see your own clients, and a client only sees their own account - never your notes or anyone else's data.",
  },
  {
    who: "Nisha",
    q: "Does Repsy take payments?",
    a: "Not yet. Business keeps a record of the plans and payments you enter yourself, with due dates. It doesn't charge cards, send payment links or make invoices.",
  },
  {
    who: "Kabir",
    q: "Can I plan without the AI?",
    a: "Yes. The Manual Planner searches the exercise library and sets sets, reps and rest for every move. Library templates make the next week one tap.",
  },
  {
    who: "Ana",
    q: "Can I take my data with me?",
    a: "Yes. Reports exports CSV files for a client's logs, measurements, payments and assigned plans, plus a roster of everyone. You can delete a client, or your whole account, at any time.",
  },
];
