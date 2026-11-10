import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Client } from "../types";
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

type Options = {
  /** The seed call, e.g. api.seedDemo or api.seedSixMonthDemo; resolves to the created clients. */
  seed: () => Promise<Client[]>;
  /** Shown when the seed created nothing. */
  alreadyLoaded: string;
};

/** onSeeded gets the first new demo client's id once every list has refreshed. */
export function useDemoSeed(onSeeded: (firstClientId: string) => void, { seed, alreadyLoaded }: Options): DemoSeed {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: seed,
    onMutate: () => setMessage(null),
    onSuccess: async (created) => {
      // Refresh everything first, so the new clients exist before one is selected.
      await queryClient.invalidateQueries();
      if (created.length > 0) {
        setMessage(`Added ${created.length} demo clients`);
        onSeeded(created[0].id);
      } else {
        setMessage(alreadyLoaded);
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
