// The habit preset library (Inspo C3, Nov 2026).
//
// A coach adding habits was facing an empty text box. These are the habits coaches actually set,
// grouped so the list is scannable, each with a sensible default recurrence.
//
// Deliberately CODE, not a table: presets are read-only, never queried, never edited, and shipping
// them as data would mean a migration every time one is reworded. A coach's own habit is still just
// a row in `habits` - picking a preset only fills in the name and the days.
export const HABIT_CATEGORIES = ["Nutrition", "Movement", "Sleep and recovery", "Mind", "Lifestyle"] as const;
export type HabitCategory = (typeof HABIT_CATEGORIES)[number];

export interface HabitPreset {
  name: string;
  category: HabitCategory;
  /** 0 = Sunday ... 6 = Saturday. All seven means every day. */
  days: number[];
}

const EVERY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

export const HABIT_PRESETS: readonly HabitPreset[] = [
  // Nutrition
  { name: "Drink 3 litres of water", category: "Nutrition", days: EVERY },
  { name: "Eat protein with every meal", category: "Nutrition", days: EVERY },
  { name: "Five portions of vegetables", category: "Nutrition", days: EVERY },
  { name: "No sugary drinks", category: "Nutrition", days: EVERY },
  { name: "Log every meal", category: "Nutrition", days: EVERY },
  { name: "Cook dinner at home", category: "Nutrition", days: WEEKDAYS },
  { name: "No late-night snacking", category: "Nutrition", days: EVERY },
  { name: "Eat breakfast within an hour of waking", category: "Nutrition", days: EVERY },
  // Movement
  { name: "10,000 steps", category: "Movement", days: EVERY },
  { name: "Train as planned", category: "Movement", days: [1, 3, 5] },
  { name: "Ten minutes of stretching", category: "Movement", days: EVERY },
  { name: "Take the stairs", category: "Movement", days: WEEKDAYS },
  { name: "A twenty minute walk after dinner", category: "Movement", days: EVERY },
  { name: "Stand up every hour", category: "Movement", days: WEEKDAYS },
  { name: "Warm up before training", category: "Movement", days: [1, 3, 5] },
  // Sleep and recovery
  { name: "Seven hours of sleep", category: "Sleep and recovery", days: EVERY },
  { name: "In bed by 11pm", category: "Sleep and recovery", days: EVERY },
  { name: "No screens an hour before bed", category: "Sleep and recovery", days: EVERY },
  { name: "Wake at the same time", category: "Sleep and recovery", days: EVERY },
  { name: "A rest day, properly", category: "Sleep and recovery", days: [0] },
  // Mind
  { name: "Ten minutes of meditation", category: "Mind", days: EVERY },
  { name: "Write down three things that went well", category: "Mind", days: EVERY },
  { name: "Ten minutes outside in daylight", category: "Mind", days: EVERY },
  { name: "No phone for the first thirty minutes", category: "Mind", days: EVERY },
  { name: "Read for fifteen minutes", category: "Mind", days: EVERY },
  // Lifestyle
  { name: "Weigh in", category: "Lifestyle", days: [1] },
  { name: "Take progress photos", category: "Lifestyle", days: [0] },
  { name: "Plan tomorrow the night before", category: "Lifestyle", days: EVERY },
  { name: "Message your coach", category: "Lifestyle", days: [0] },
  { name: "No alcohol", category: "Lifestyle", days: EVERY },
  { name: "Pack a gym bag the night before", category: "Lifestyle", days: [0, 2, 4] },
];
