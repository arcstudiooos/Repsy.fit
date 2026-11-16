import { useRef, type ReactNode } from "react";
import { Modal } from "./Modal";

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
 * Confirm box: focus starts on Cancel, Escape cancels, the page behind is dimmed and not clickable.
 *
 * Nov 2026: this is now a thin wrapper over Modal. It predated the Modal primitive and carried its
 * own copy of the native-<dialog> mechanics, which meant it quietly missed two things Modal does:
 * it never returned focus to whatever opened it (a keyboard user lost their place in the list after
 * every delete), and it did not lock the page scroll. It also labelled itself with a HARDCODED
 * element id, so two confirms on one page would have produced duplicate ids.
 *
 * The props are deliberately unchanged, so all fifteen call sites were left alone.
 */
export function ConfirmDialog({ title, children, confirmLabel, pendingLabel, pending = false, onConfirm, onCancel }: Props) {
  // Destructive confirms start on Cancel: the safe button is the one under the user's finger.
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      title={title}
      size="sm"
      initialFocus={cancelRef}
      busy={pending}
      onRequestClose={() => {
        if (!pending) onCancel();
      }}
      footer={
        <>
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={pending} className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={pending} className="btn btn-danger">
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-dim">{children}</div>
    </Modal>
  );
}
