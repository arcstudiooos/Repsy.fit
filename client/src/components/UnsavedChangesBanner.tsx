// The unsaved-changes banner (Inspo W13, Nov 2026).
//
// A coach half-way through the workout builder who clicks another client loses the lot. Spur.fit's
// answer is a bar pinned under the header - "Unsaved changes in HIIT Intermediate" with Continue and
// Discard - which protects the work WITHOUT trapping the coach in a modal. That is the behaviour
// worth copying: never block navigation, always offer the way back.
//
// This is deliberately tiny and generic: anything with a draft registers itself, and whoever is
// mounted renders the banner. No context gymnastics, no new dependency - one module-level store.
import { useEffect, useState } from "react";

/** What is holding unsaved work, and how to get back to it or throw it away. */
export type Draft = {
  /** Stable id for the thing being edited, so re-registering replaces rather than stacks. */
  id: string;
  /** Shown in the banner: "Lower body", "Leg day template". */
  label: string;
  /** What kind of thing, for the sentence: "workout", "plan", "meal". */
  kind: string;
  /** Put the coach back in front of it. */
  resume: () => void;
  /** Throw the draft away. */
  discard: () => void;
  /**
   * The unsaved work itself.
   *
   * It has to live here, not in the editor's component state: navigating away unmounts the editor,
   * and "Continue editing" must bring back what the coach actually typed, not what the server last
   * sent. Shape is the editor's business; it is the only thing that reads it back.
   */
  payload?: unknown;
};

let draft: Draft | null = null;
const listeners = new Set<(d: Draft | null) => void>();

const emit = () => {
  for (const l of listeners) l(draft);
};

/**
 * Register unsaved work. Call with null to clear.
 *
 * Re-registering the same id replaces it, so a builder can call this on every keystroke without
 * stacking banners.
 */
export function setDraft(next: Draft | null) {
  draft = next;
  emit();
}

/** Clear the banner, but only if it is still about `id`: avoids a stale unmount wiping a newer draft. */
export function clearDraft(id: string) {
  if (draft?.id === id) setDraft(null);
}

export const getDraft = () => draft;

/** Subscribe a component to the current draft. */
export function useDraft(): Draft | null {
  const [value, setValue] = useState<Draft | null>(draft);
  useEffect(() => {
    listeners.add(setValue);
    setValue(draft);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/**
 * The banner. Renders nothing when there is no draft, so it can sit in the layout unconditionally.
 *
 * Not a modal on purpose: the coach keeps browsing, and the way back stays one click away.
 */
export function UnsavedChangesBanner() {
  const d = useDraft();
  if (!d) return null;
  return (
    <div
      role="status"
      aria-label="Unsaved changes"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-card border border-border-strong bg-surface2 px-3 py-2"
    >
      <p className="min-w-0 flex-1 text-sm text-text">
        Unsaved changes in <span className="font-semibold">{d.label}</span>
        {d.kind ? ` ${d.kind}` : ""}.
      </p>
      <button type="button" className="btn btn-secondary min-h-10" onClick={d.resume}>
        Continue editing
      </button>
      <button
        type="button"
        className="btn btn-secondary min-h-10"
        onClick={() => {
          d.discard();
          clearDraft(d.id);
        }}
      >
        Discard
      </button>
    </div>
  );
}
