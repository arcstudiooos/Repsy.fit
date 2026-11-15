// The signed-in coach's weight unit (Nov 2026).
//
// Lives in one hook because it is needed in half a dozen unrelated components, and the bug it fixes
// was exactly the kind that scattered reads cause: some places converted to the coach's unit, the
// INPUT boxes did not, so a coach working in pounds typed 150 and 150 kilos was stored.
//
// "kg" is the fallback. It is what every coach meant before the setting existed, and it is what the
// database stores, so an unreadable profile shows raw stored numbers rather than wrong ones.
import { useQuery } from "@tanstack/react-query";
import { getMe, queryKeys } from "../api";

export type WeightUnits = "kg" | "lb";

export function useCoachUnits(): WeightUnits {
  const { data } = useQuery({ queryKey: queryKeys.me, queryFn: getMe });
  return data?.units === "lb" ? "lb" : "kg";
}
