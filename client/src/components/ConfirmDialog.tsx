import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Modal confirm box (native <dialog>): focus starts on Cancel, Escape cancels,
 * the page behind is dimmed and not clickable.
 */
export function ConfirmDialog({ title, children, confirmLabel, pendingLabel, pending = false, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault(); // Escape: let the parent close it
        if (!pending) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-6 text-text backdrop:bg-header/60"
    >
      <h2 id="confirm-title" className="text-xl">
        {title}
      </h2>
      <div className="mt-2 text-dim">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="btn btn-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="btn btn-danger"
        >
          {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
