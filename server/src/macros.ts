// Macro calculator (Prompt 61): a starting estimate for coaching only - not medical advice, a diagnosis or a
// prescription. Mifflin-St Jeor BMR -> TDEE by activity -> goal adjustment -> protein / fat / carbs.
// One pure function so every number can be checked by hand (see server/test/macros.test.ts).

export const SEXES = ["Female", "Male"] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = ["Sedentary", "Light", "Moderate", "Active", "Athlete"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/** TDEE = BMR x this. */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  Sedentary: 1.2,
  Light: 1.375,
  Moderate: 1.55,
  Active: 1.725,
  Athlete: 1.9,
};

export const MIN_AGE = 18;
export const UNDER_18_MESSAGE = "Macros are only calculated for adults aged 18 or older.";

/** Bad input for the calculator; the route turns it into a 400 with this plain message. */
export class MacroInputError extends Error {}

export interface MacroInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activity: ActivityLevel;
  /** Free text (the goal list or anything else). */
  goal: string;
}

export interface MacroResult {
  /** Resting energy (Mifflin-St Jeor), whole kcal. */
  bmr: number;
  /** Maintenance: BMR x activity multiplier, whole kcal. */
  tdee: number;
  /** Target after the goal adjustment, whole kcal. */
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function calculateMacros(input: MacroInput): MacroResult {
  // Named constants for the rules.
  const FAT_LOSS_ADJUSTMENT = -0.2; // fat loss goals: 20% under maintenance
  const MUSCLE_GAIN_ADJUSTMENT = 0.1; // muscle gain goals: 10% over maintenance
  const OTHER_GOAL_ADJUSTMENT = 0; // every other goal: maintenance
  const PROTEIN_G_PER_KG = 2;
  const FAT_SHARE_OF_CALORIES = 0.25;
  const KCAL_PER_G_PROTEIN = 4;
  const KCAL_PER_G_CARBS = 4;
  const KCAL_PER_G_FAT = 9;

  const { weightKg, heightCm, age, sex, activity, goal } = input;
  if (age < MIN_AGE) throw new MacroInputError(UNDER_18_MESSAGE);

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "Male" ? 5 : -161);
  const tdee = bmr * ACTIVITY_MULTIPLIERS[activity];

  // Same reading of the goal text as the at-risk rule: "Fat loss + strength" counts as fat loss.
  const goalText = goal.toLowerCase();
  const adjustment = goalText.includes("fat loss")
    ? FAT_LOSS_ADJUSTMENT
    : goalText.includes("muscle gain")
      ? MUSCLE_GAIN_ADJUSTMENT
      : OTHER_GOAL_ADJUSTMENT;
  const calories = Math.round(tdee * (1 + adjustment));

  // Grams are rounded first, then carbs take what is left of the rounded calorie target.
  // At extreme inputs (very heavy, short, older, sedentary, fat loss) protein at 2 g/kg plus the fat
  // share can exceed the calorie target on their own. Carbs then floor at 0 g rather than going
  // negative, so in that case the macros add up to MORE than `calories` - deliberately: protein is
  // never cut to make the sum fit. Pinned by a test in server/test/macros.test.ts.
  const proteinG = Math.round(PROTEIN_G_PER_KG * weightKg);
  const fatG = Math.round((calories * FAT_SHARE_OF_CALORIES) / KCAL_PER_G_FAT);
  const carbsG = Math.max(0, Math.round((calories - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT) / KCAL_PER_G_CARBS));

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), calories, proteinG, carbsG, fatG };
}
