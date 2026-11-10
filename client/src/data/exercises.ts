// Exercise library for the Planner's Workout search (46 exercises).
export type Exercise = { name: string; group: string };

const LIBRARY: Record<string, string[]> = {
  Legs: [
    "Back Squat",
    "Front Squat",
    "Goblet Squat",
    "Leg Press",
    "Walking Lunge",
    "Bulgarian Split Squat",
    "Leg Extension",
    "Standing Calf Raise",
  ],
  "Glutes & Hamstrings": ["Romanian Deadlift", "Hip Thrust", "Hamstring Curl", "Good Morning", "Glute Bridge"],
  Back: ["Deadlift", "Barbell Row", "One-Arm Dumbbell Row", "Seated Cable Row", "Lat Pulldown", "Pull-Up", "Chin-Up"],
  Chest: ["Bench Press", "Incline Dumbbell Press", "Chest Fly", "Push-Up"],
  "Chest & Triceps": ["Dips"],
  Shoulders: ["Overhead Press", "Lateral Raise", "Rear Delt Fly", "Face Pull"],
  Arms: ["Bicep Curl", "Hammer Curl", "Triceps Pushdown", "Skull Crusher"],
  Core: ["Plank", "Dead Bug", "Cable Crunch", "Russian Twist"],
  "Full Body": ["Kettlebell Swing", "Farmer's Carry"],
  Power: ["Box Jump"],
  Conditioning: ["Burpee", "Battle Ropes", "Mountain Climbers", "Rowing Machine", "Treadmill Intervals", "Cycling Intervals"],
};

export const EXERCISES: Exercise[] = Object.entries(LIBRARY).flatMap(([group, names]) =>
  names.map((name) => ({ name, group })),
);

export const CUSTOM_GROUP = "Custom";

/** Library exercises whose name OR group contains the query (case-insensitive), at most `limit`. */
export function searchExercises(query: string, limit = 8): Exercise[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return EXERCISES.filter((e) => e.name.toLowerCase().includes(q) || e.group.toLowerCase().includes(q)).slice(0, limit);
}
