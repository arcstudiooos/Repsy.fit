// =============================================================================
// TEMP - sample clients for the client selector strip.
// To be replaced by the real API (listClients) in Prompt 11: delete this file and
// set USE_TEMP_SAMPLE_CLIENTS to false / remove it in App.tsx.
// =============================================================================
import type { Client } from "./types";

// TEMP: flip to false (or remove) in Prompt 11 to use the real clients API.
export const USE_TEMP_SAMPLE_CLIENTS = true;

const base = {
  coachId: "default-coach",
  age: null,
  weightKg: null,
  heightCm: null,
  level: "Beginner",
  focus: "",
  notes: "",
  createdAt: "2026-11-10T00:00:00.000Z",
} as const;

// TEMP sample data - not from the database.
export const TEMP_SAMPLE_CLIENTS: Client[] = [
  { ...base, id: "temp-maya-patel", name: "Maya Patel", goal: "Fat loss + strength" },
  { ...base, id: "temp-arjun-mehta", name: "Arjun Mehta", goal: "Muscle gain" },
  { ...base, id: "temp-casey-jordan", name: "Casey Jordan", goal: "Marathon prep + conditioning" },
];
