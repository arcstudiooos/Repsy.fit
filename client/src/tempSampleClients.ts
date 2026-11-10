// =============================================================================
// TEMP - sample clients and TEMP state scenarios for the client selector strip
// and the empty / loading / error screens.
// To be replaced by the real API (listClients) in Prompt 11: delete this file and
// set USE_TEMP_SAMPLE_CLIENTS to false / remove it in App.tsx.
// =============================================================================
import { ApiError } from "./api";
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

// -----------------------------------------------------------------------------
// TEMP state scenarios. Pick one with the URL, e.g.  /?tempState=empty
//   sample  (default) - the 3 sample clients above
//   empty             - zero clients            -> EmptyState
//   loading           - the request never ends  -> LoadingState
//   error             - the request fails       -> ErrorState (Retry refetches)
// Or change TEMP_DEFAULT_SCENARIO below.
// -----------------------------------------------------------------------------
export const TEMP_SCENARIOS = ["sample", "empty", "loading", "error"] as const;
export type TempScenario = (typeof TEMP_SCENARIOS)[number];

const TEMP_DEFAULT_SCENARIO: TempScenario = "sample";

export function tempScenario(): TempScenario {
  const fromUrl = new URLSearchParams(window.location.search).get("tempState");
  return (TEMP_SCENARIOS as readonly string[]).includes(fromUrl ?? "") ? (fromUrl as TempScenario) : TEMP_DEFAULT_SCENARIO;
}

/** TEMP stand-in for listClients(), behaving according to the current scenario. */
export async function tempListClients(): Promise<Client[]> {
  const scenario = tempScenario();
  if (scenario === "loading") return new Promise<Client[]>(() => {}); // never resolves
  await new Promise((r) => setTimeout(r, 300)); // feel like a real request
  if (scenario === "error") throw new ApiError("TEMP simulated failure: GET /api/clients", "network", null, "GET /api/clients");
  if (scenario === "empty") return [];
  return TEMP_SAMPLE_CLIENTS;
}
