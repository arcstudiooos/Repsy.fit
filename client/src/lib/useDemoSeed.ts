import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { seedDemo } from "../api";
import { plainErrorMessage } from "../components/States";

/** Shared state for every "Load demo" button (empty state and Clients tab). */
export type DemoSeed = {
  run: () => void;
  pending: boolean;
  /** "Added 3 demo clients" / "Demo already loaded" after a seed, else null. */
  message: string | null;
  /** Plain-words error from the last failed seed, else null. */
  error: string | null;
};

/** onSeeded gets the first new demo client's id once every list has refreshed. */
export function useDemoSeed(onSeeded: (firstClientId: string) => void): DemoSeed {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: seedDemo,
    onMutate: () => setMessage(null),
    onSuccess: async (created) => {
      // Refresh everything first, so the new clients exist before one is selected.
      await queryClient.invalidateQueries();
      if (created.length > 0) {
        setMessage(`Added ${created.length} demo clients`);
        onSeeded(created[0].id);
      } else {
        setMessage("Demo already loaded");
      }
    },
  });
  return {
    run: () => mutation.mutate(),
    pending: mutation.isPending,
    message,
    error: mutation.isError ? plainErrorMessage(mutation.error) : null,
  };
}
