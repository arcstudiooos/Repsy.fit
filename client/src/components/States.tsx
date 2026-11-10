import { ApiError } from "../api";

/** Turns any error into a short, plain-words message for coaches. */
export function plainErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "network") return "We couldn't reach the server. Check your connection and try again.";
    if (error.kind === "endpoint_missing") return "This part of Repsy isn't available on the server yet.";
    if (error.status !== null && error.status >= 500) return "The server had a problem. Please try again in a moment.";
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

const secondaryButton =
  "rounded-lg border border-border bg-surface2 px-4 py-2 text-sm font-semibold text-text hover:border-dim";

type EmptyStateProps = {
  onAddClient: () => void;
  seedDemo: () => void;
};

/** Shown when there are zero clients. */
export function EmptyState({ onAddClient, seedDemo }: EmptyStateProps) {
  return (
    <div className="card p-6 text-center sm:p-8">
      <h2 className="text-2xl">No clients yet</h2>
      <p className="mt-2 text-dim">Add your first client, or load demo clients to explore.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onAddClient} className="btn-primary rounded-lg px-4 py-2 text-sm">
          Add a client
        </button>
        <button type="button" onClick={seedDemo} className={secondaryButton}>
          Load demo clients
        </button>
      </div>
      <p className="mt-4 text-xs text-dim">Demo data is sample data - delete any client anytime.</p>
    </div>
  );
}

/** Simple centred loading card. */
export function LoadingState() {
  return (
    <div role="status" aria-live="polite" className="card flex min-h-40 items-center justify-center p-6">
      <p className="font-heading text-xl font-semibold uppercase tracking-wide text-dim">Loading...</p>
    </div>
  );
}

type ErrorStateProps = {
  error: unknown;
  onRetry: () => void;
};

/** Error message in plain words plus a Retry button. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="card p-6 text-center sm:p-8">
      <h2 className="text-2xl">Something went wrong</h2>
      <p className="mt-2 text-dim">{plainErrorMessage(error)}</p>
      <button type="button" onClick={onRetry} className="btn-primary mt-5 rounded-lg px-4 py-2 text-sm">
        Retry
      </button>
    </div>
  );
}
