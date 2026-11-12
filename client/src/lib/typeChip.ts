import type { AssignmentType } from "../types";

// Chip background in the type colour; text picked per colour for readable contrast. Its own tiny module
// (Prompt 79) so the client app can use it without pulling in the coach's AI Coach tab.
export const TYPE_CHIP: Record<AssignmentType, string> = {
  Workout: "bg-type-workout text-on-accent",
  Nutrition: "bg-type-nutrition text-white",
  Habit: "bg-type-habit text-on-accent",
  Recovery: "bg-type-recovery text-white",
};
