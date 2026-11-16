// The one modal/dialog primitive for the coach app (UI batch: dialog system).
//
// Built on the browser's native <dialog> + showModal(), exactly like ConfirmDialog (which stays as
// the confirm-shaped wrapper). No new dependency: the top layer, the backdrop, Escape -> `cancel`,
// and inerting the page behind are all native. Everything the platform does NOT give us - which
// element gets focus first, giving focus back to the trigger after React unmounts the dialog,
// backdrop clicks, body scroll locking - is implemented here, once.
//
// Mounting contract (same as ConfirmDialog): the parent renders it conditionally,
// `{open && <Modal ... />}`. There is no `open` prop and the `open` ATTRIBUTE is never set: a
// <dialog open> is non-modal (no top layer, no backdrop, no inert page), which is the single
// easiest way to get a broken dialog.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

/** sm = confirm, md = a form, lg = a long searchable picker (exercises, meals). */
export type ModalSize = "sm" | "md" | "lg";

/** How a centred modal behaves below the `sm` breakpoint (640px). */
export type ModalMobile = "centered" | "sheet" | "fullscreen";

/** Why the dialog is asking to close. The parent decides what that means. */
export type DismissReason = "escape" | "backdrop" | "close-button" | "native";

type Props = {
  /** Accessible name. Rendered as the <h2> and wired to the dialog with aria-labelledby. */
  title: string;
  /** One line under the title. Wired with aria-describedby, so screen readers read it on open. */
  description?: ReactNode;
  size?: ModalSize;
  /** Default: "centered" for sm, "sheet" for md, "fullscreen" for lg. */
  mobile?: ModalMobile;
  /** Scrolling content. */
  children: ReactNode;
  /** Pinned action row (Save / Cancel). Never scrolls away. */
  footer?: ReactNode;
  /**
   * What gets focus on open. Omit and the dialog itself is focused, so the first thing announced is
   * "<title>, dialog" rather than the first input - and no phone keyboard pops up over the content.
   * Point it at the search box of a picker, or at Cancel on a destructive confirm.
   */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Where focus goes on close. Default: whatever was focused when the dialog opened. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /**
   * The content holds unsaved edits. Backdrop clicks are then ignored (they carry no intent and are
   * the most common accidental dismissal); Escape and the close button still call onRequestClose, so
   * the parent can register a draft with setDraft() instead of discarding.
   */
  dirty?: boolean;
  /** A request is in flight: every dismissal route is disabled so a half-saved form cannot vanish. */
  busy?: boolean;
  /** Hide the ✕. Only for dialogs whose footer already has a Cancel - never on touch-only flows. */
  hideCloseButton?: boolean;
  /** Called for every dismissal route. The parent unmounts the Modal; the Modal never self-closes. */
  onRequestClose: (reason: DismissReason) => void;
};

/* ------------------------------------------------------------------ *
 * Body scroll lock: ref-counted, no layout shift, no library.
 * ------------------------------------------------------------------ */

let lockCount = 0;
let unlock: (() => void) | null = null;

function lockPageScroll() {
  lockCount += 1;
  if (lockCount > 1) return; // nested dialog: already locked
  const html = document.documentElement;
  const prevOverflow = html.style.overflow;
  const prevGutter = html.style.scrollbarGutter;
  const prevPadding = html.style.paddingInlineEnd;
  // Only compensate when a classic scrollbar is actually taking width (overlay scrollbars: 0).
  // `overflow: hidden` keeps the element a scroll container (it is still scrollable in script), so
  // `scrollbar-gutter: stable` does reserve the space and the page behind does not reflow. This was
  // doubted once because a test saw the page shift 30px on open - that turned out to be a lazily
  // loaded panel still shrinking the document, not this lock. Verified: the scroll position is
  // identical before opening and after closing (e2e-ui/invite-dialog.spec.ts).
  const scrollbar = window.innerWidth - html.clientWidth;
  html.style.overflow = "hidden";
  if (scrollbar > 0) {
    if (CSS.supports("scrollbar-gutter", "stable")) html.style.scrollbarGutter = "stable";
    else html.style.paddingInlineEnd = `${scrollbar}px`;
  }
  unlock = () => {
    html.style.overflow = prevOverflow;
    html.style.scrollbarGutter = prevGutter;
    html.style.paddingInlineEnd = prevPadding;
  };
}

function unlockPageScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && unlock) {
    unlock();
    unlock = null;
  }
}

/* ------------------------------------------------------------------ *
 * Nesting depth: one picker on top of a form is allowed, deeper is a smell.
 * ------------------------------------------------------------------ */

const ModalDepth = createContext(0);

/** How deep inside modals this component is: 0 = page, 1 = inside a modal. */
export const useModalDepth = () => useContext(ModalDepth);

/* ------------------------------------------------------------------ *
 * Looks. z-index scale: 10 in-card, 20 bottom tab bar, 30 menus + toasts, 50 overlay layer.
 * A modal <dialog> lives in the top layer, which beats every z-index - z-50 is only here so a
 * sticky header INSIDE the dialog has a rung to stand on. Never z-[9999].
 * ------------------------------------------------------------------ */

const SHELL =
  "z-50 grid max-h-[85svh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border border-border " +
  "bg-surface p-0 text-text rounded-card backdrop:bg-header/60";

const SIZE: Record<ModalSize, string> = {
  sm: "sm:w-[min(28rem,calc(100vw-2rem))]",
  md: "sm:w-[min(40rem,calc(100vw-2rem))]",
  lg: "sm:w-[min(64rem,calc(100vw-2rem))] sm:h-[min(44rem,85svh)]",
};

// max-w-none matters: Chrome's UA stylesheet caps a dialog at calc(100% - 6px - 2em), so an
// edge-to-edge sheet silently comes out 38px narrow without it.
const MOBILE: Record<ModalMobile, string> = {
  // Phones: a centred box is fine for a two-button confirm.
  centered: "m-auto w-[min(28rem,calc(100vw-2rem))] max-w-none",
  // Phones: bottom sheet - thumb-reachable actions, keeps context visible above it.
  sheet:
    "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:m-0 max-sm:w-full " +
    "max-sm:max-w-none max-sm:max-h-[90svh] max-sm:rounded-b-none sm:m-auto",
  // Phones: a long searchable list needs the whole screen, not a letterbox.
  fullscreen:
    "max-sm:fixed max-sm:inset-0 max-sm:m-0 max-sm:h-full max-sm:max-h-none max-sm:w-full " +
    "max-sm:max-w-none max-sm:rounded-none sm:m-auto",
};

const DEFAULT_MOBILE: Record<ModalSize, ModalMobile> = { sm: "centered", md: "sheet", lg: "fullscreen" };

/**
 * Accessible modal dialog.
 *
 * Native gives us: role="dialog" + implicit aria-modal, the top layer (above every z-index), the
 * ::backdrop box, Escape -> cancel event, and inerting the rest of the document (so Tab cannot
 * leave the dialog - no focus-trap library needed).
 *
 * We add: deterministic initial focus, focus return after React unmounts us, backdrop-click
 * handling, the dirty-content rules, and the page scroll lock.
 */
export function Modal({
  title,
  description,
  size = "md",
  mobile,
  children,
  footer,
  initialFocus,
  returnFocusTo,
  dirty = false,
  busy = false,
  hideCloseButton = false,
  onRequestClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const pointerStartedOnBackdrop = useRef(false);
  const closingRef = useRef(false);
  const [hint, setHint] = useState("");
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;
  const depth = useModalDepth();

  // Latest-value refs: the open/close effect must run exactly once, so it cannot close over props.
  const latest = useRef({ dirty, busy, onRequestClose, initialFocus, returnFocusTo });
  latest.current = { dirty, busy, onRequestClose, initialFocus, returnFocusTo };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Remember the trigger BEFORE showModal() moves focus. Native restores focus on close(), but
    // only while the dialog is still in the document - and React unmounts us on close, so the
    // native restore silently does nothing. Hence doing it by hand.
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!dialog.open) dialog.showModal(); // throws InvalidStateError if already open - hence the guard
    lockPageScroll();

    // Initial focus rule: the caller's element, else the dialog itself (announces title + role, and
    // does not raise the on-screen keyboard). preventScroll stops Chrome jumping past the heading.
    const target = latest.current.initialFocus?.current ?? dialog;
    target.focus({ preventScroll: true });

    if (depth >= 2) {
      console.warn(
        "[Modal] Three dialogs deep. Swap the content inside one dialog instead of stacking a third.",
      );
    }

    return () => {
      closingRef.current = true;
      if (dialog.open) dialog.close();
      unlockPageScroll();
      const back = latest.current.returnFocusTo?.current ?? triggerRef.current;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
    // Intentionally once per mount: this component IS the open state.
  }, []);

  // Clear the "you have unsaved changes" nudge again so it never becomes furniture.
  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(""), 5000);
    return () => window.clearTimeout(t);
  }, [hint]);

  const requestClose = useCallback(
    (reason: DismissReason) => {
      if (closingRef.current || latest.current.busy) return;
      latest.current.onRequestClose(reason);
    },
    [],
  );

  /** Was this pointer event outside the dialog's own box, i.e. on the ::backdrop? */
  const onBackdrop = (e: ReactPointerEvent<HTMLDialogElement>) => {
    if (e.target !== dialogRef.current) return false; // a click on content
    const r = dialogRef.current.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  const mobileClass = MOBILE[mobile ?? DEFAULT_MOBILE[size]];

  return (
    // Portal to <body>: a Modal mounted from inside a <form> would otherwise nest forms (illegal
    // HTML, breaks submit), and ancestors with transform / filter / content-visibility can clip or
    // mis-place a dialog in some engines. Portalling sidesteps both.
    createPortal(
      <ModalDepth.Provider value={depth + 1}>
        <dialog
          ref={dialogRef}
          tabIndex={-1}
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          // No role="dialog" and no aria-modal: a modal <dialog> already has both. Repeating
          // aria-modal is how dialogs end up lying to screen readers when they later go non-modal.
          className={`${SHELL} ${SIZE[size]} ${mobileClass}`}
          // Escape (and Android's back gesture, as a "close request"). Always prevented: the parent
          // owns unmounting, and a native close would strand React state as open.
          onCancel={(e) => {
            // React routes `cancel` / `close` through the React tree, so a NESTED dialog's Escape
            // would otherwise also fire the parent Modal's handler and close both. Only ours counts.
            if (e.target !== dialogRef.current) return;
            e.preventDefault();
            requestClose("escape");
          }}
          // Safety net: something closed us natively (a stray <button formmethod="dialog">).
          onClose={(e) => {
            if (e.target !== dialogRef.current) return;
            requestClose("native");
          }}
          // pointerdown + pointerup, both outside the box: a click that merely ENDED on the backdrop
          // (text selection dragged out of the dialog) must not close it. Checking coordinates rather
          // than just `e.target === dialog` also survives Chrome reporting native <select> popups as
          // the dialog itself.
          onPointerDown={(e) => {
            pointerStartedOnBackdrop.current = onBackdrop(e);
          }}
          onPointerUp={(e) => {
            const outside = pointerStartedOnBackdrop.current && onBackdrop(e);
            pointerStartedOnBackdrop.current = false;
            if (!outside) return;
            if (dirty) {
              // Deliberately not a silent discard, and not a second dialog on top: say so and let
              // the coach use Cancel / Save (or Escape, which routes through onRequestClose).
              setHint("You have unsaved changes. Use Cancel or Save to leave.");
              return;
            }
            requestClose("backdrop");
          }}
        >
          <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="card-title">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-1 text-sm text-dim">
                  {description}
                </p>
              ) : null}
            </div>
            {hideCloseButton ? null : (
              // Always present on touch: phones have no Escape key, and a backdrop tap is not
              // discoverable. aria-label, because the glyph is not a name.
              <button
                type="button"
                aria-label="Close"
                disabled={busy}
                onClick={() => requestClose("close-button")}
                className="btn btn-ghost -mr-2 min-h-10 px-3 text-lg leading-none"
              >
                ✕
              </button>
            )}
          </div>

          {/* The only scroll container. overscroll-contain stops the scroll chaining to the page
              (which the lock also blocks, but iOS honours overscroll-behavior first). */}
          <div className="overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{children}</div>

          {footer ? (
            <div className="flex flex-wrap justify-end gap-3 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
              {footer}
            </div>
          ) : null}

          {/* Announced without stealing focus, and visible: a backdrop tap that did nothing has to
              explain itself. */}
          <p role="status" aria-live="polite" className={hint ? "px-4 pb-3 text-sm text-amber-text sm:px-6" : "sr-only"}>
            {hint}
          </p>
        </dialog>
      </ModalDepth.Provider>,
      document.body,
    )
  );
}
