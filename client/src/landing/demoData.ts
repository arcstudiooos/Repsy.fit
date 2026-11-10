// Landing page demo data (Prompt 40). Front-end only: sample clients and canned answers.
// General-wellness only - no medical advice. Nothing here is sent anywhere or stored.
export type DemoType = "Workout" | "Nutrition" | "Habit" | "Recovery";
export type DemoPlan = { type: DemoType; title: string; details: string; reasoning: string };
export type DemoAnswer = { answer: string; plan: DemoPlan | null };
export type DemoClient = { id: string; name: string; goal: string; level: string };

export const DEMO_CLIENTS: DemoClient[] = [
  { id: "maya", name: "Maya Patel", goal: "Fat loss + strength", level: "Intermediate" },
  { id: "arjun", name: "Arjun Mehta", goal: "Muscle gain", level: "Beginner" },
  { id: "casey", name: "Casey Jordan", goal: "Marathon prep + conditioning", level: "Advanced" },
];

export const DEMO_TYPES: DemoType[] = ["Workout", "Nutrition", "Habit", "Recovery"];

/** Type colours from the design system (same as the app's type chips). */
export const TYPE_COLOUR: Record<DemoType, string> = {
  Workout: "#FF4A1F",
  Nutrition: "#0E7C6B",
  Habit: "#D97706",
  Recovery: "#7C5CFC",
};

export const SAMPLE_NOTE = "Sample answer - the real app uses your client's real data.";

export const DEMO_ANSWERS: Record<string, Record<DemoType, DemoAnswer>> = {
  maya: {
    Workout: {
      answer: "Maya trains 4x a week at an intermediate level and wants fat loss plus strength. Keep her 4 sessions and make one a focused lower-body strength day.",
      plan: { type: "Workout", title: "Lower-body strength day", details: "1. Back Squat — 4 sets × 6 reps · Rest 120s\n2. Romanian Deadlift — 3 sets × 8 reps · Rest 90s\n3. Walking Lunge — 3 sets × 10 reps · Rest 60s", reasoning: "Builds strength for her goal without adding a fifth training day." },
    },
    Nutrition: {
      answer: "Maya is vegetarian, so protein needs a plan. Aim for a protein source at every meal and keep a simple go-to snack ready.",
      plan: { type: "Nutrition", title: "Vegetarian protein-first day", details: "Protein at each meal (lentils, tofu, paneer, Greek yoghurt). 1 protein snack. 2.5L+ water.", reasoning: "Supports fat loss and strength while fitting her vegetarian diet." },
    },
    Habit: {
      answer: "Maya's sleep is inconsistent on weekdays. A small, repeatable evening routine is the easiest win.",
      plan: { type: "Habit", title: "Weekday wind-down", details: "Screens off 30 min before bed. Same bedtime Sunday-Thursday. 8,000+ steps daily.", reasoning: "Better sleep supports recovery and steadier energy for training." },
    },
    Recovery: {
      answer: "With 4 sessions a week, one lighter day and short daily mobility will help Maya keep training consistently.",
      plan: { type: "Recovery", title: "Mobility + easy day", details: "10-min mobility daily. One easy walk day. Keep 2 full rest days.", reasoning: "Keeps her consistent by managing fatigue across the week." },
    },
  },
  arjun: {
    Workout: {
      answer: "Arjun is a beginner aiming for muscle gain and prefers mornings. Three full-body sessions with simple compound lifts is a solid start.",
      plan: { type: "Workout", title: "Beginner full-body A", details: "1. Goblet Squat — 3 sets × 10 reps · Rest 90s\n2. Push-Up — 3 sets × 10 reps · Rest 60s\n3. Lat Pulldown — 3 sets × 12 reps · Rest 60s", reasoning: "Simple lifts he can learn well, with room to add weight each week." },
    },
    Nutrition: {
      answer: "Arjun needs a calorie surplus on a student budget. Cheap, filling staples and one extra meal or snack a day will do it.",
      plan: { type: "Nutrition", title: "Budget surplus plan", details: "Add 1 meal or snack daily (oats + milk, eggs, rice + dal). Protein at each meal.", reasoning: "A small, steady surplus supports muscle gain within his budget." },
    },
    Habit: {
      answer: "Arjun trains in the mornings, so a fixed bedtime will make those sessions easier to keep.",
      plan: { type: "Habit", title: "Morning-training routine", details: "Bed by 11pm. Breakfast ready the night before. Log every meal.", reasoning: "Makes morning sessions easier to stick to, week after week." },
    },
    Recovery: {
      answer: "As a beginner, Arjun recovers best with a full rest day between sessions and decent sleep.",
      plan: { type: "Recovery", title: "Rest-day structure", details: "Rest day between sessions. 10-min stretch after training. 7-8 hours sleep.", reasoning: "Recovery between sessions is when beginners make most of their progress." },
    },
  },
  casey: {
    Workout: {
      answer: "Casey is an advanced runner preparing for a marathon. Two short strength sessions a week support running economy.",
      plan: { type: "Workout", title: "Runner strength session", details: "1. Bulgarian Split Squat — 3 sets × 8 reps · Rest 90s\n2. Romanian Deadlift — 3 sets × 8 reps · Rest 90s\n3. Standing Calf Raise — 3 sets × 15 reps · Rest 60s", reasoning: "Strengthens the legs for marathon training without adding much fatigue." },
    },
    Nutrition: {
      answer: "With 5 runs a week, Casey needs carbs around the long run and steady hydration.",
      plan: { type: "Nutrition", title: "Long-run fuelling", details: "Carb-rich dinner before the long run. Water + electrolytes during. Protein within 2 hours after.", reasoning: "Fuelling the long run well supports training quality for marathon prep." },
    },
    Habit: {
      answer: "Casey runs 5x a week. Logging each run's feel helps spot fatigue early.",
      plan: { type: "Habit", title: "Run log habit", details: "Log distance, pace and feel (1-10) after every run. Weekly review on Sunday.", reasoning: "Tracking how runs feel helps adjust the plan before fatigue builds." },
    },
    Recovery: {
      answer: "Casey has a history of shin splints, so easy weeks and gradual mileage matter. If pain returns, a qualified professional should check it.",
      plan: { type: "Recovery", title: "Lower-impact easy week", details: "Cut weekly mileage by about 30%. Swap one run for cycling. Daily calf + shin mobility.", reasoning: "Lowers impact load to help keep training consistent." },
    },
  },
};

/** Keyword match for the free-text box. null = no topic matched. */
export function matchType(question: string): DemoType | null {
  const q = question.toLowerCase();
  if (/workout|train|strength|lift|squat|gym|exercise|session|run\b|running/.test(q)) return "Workout";
  if (/food|eat|protein|nutrition|meal|diet|calorie|carb|hydrat|water/.test(q)) return "Nutrition";
  if (/sleep|steps|habit|routine|bed|morning|log/.test(q)) return "Habit";
  if (/recover|sore|rest|deload|mobility|stretch|tired|fatigue/.test(q)) return "Recovery";
  return null;
}

/** Medical words: answer with a safe referral, never advice. */
export function isMedical(question: string): boolean {
  return /pain|injur|diagnos|medic|doctor|sick|illness|disease|symptom|prescri|pregnan|surgery/i.test(question);
}

export function fallbackAnswer(client: DemoClient): DemoAnswer {
  return {
    answer: `Here's what I can see for ${client.name}: goal is ${client.goal}, level ${client.level}. Try asking about a workout, nutrition, a habit or recovery.`,
    plan: null,
  };
}

export function medicalAnswer(client: DemoClient): DemoAnswer {
  return {
    answer: `That sounds like a health question for ${client.name}. Repsy gives general wellness guidance only - please have them see a qualified professional.`,
    plan: null,
  };
}

/** The canned answer for a quick-ask type or a free-text question. Never throws. */
export function demoAnswer(client: DemoClient, ask: DemoType | string): DemoAnswer {
  if ((DEMO_TYPES as string[]).includes(ask)) return DEMO_ANSWERS[client.id][ask as DemoType];
  if (isMedical(ask)) return medicalAnswer(client);
  const type = matchType(ask);
  return type ? DEMO_ANSWERS[client.id][type] : fallbackAnswer(client);
}
