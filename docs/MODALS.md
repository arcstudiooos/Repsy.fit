# Dialogs: how to build one

The only dialog primitive is `client/src/components/Modal.tsx` (native `<dialog>` + `showModal()`,
no dependency). `ConfirmDialog.tsx` stays as the confirm-shaped wrapper. Rules, in order of how
often they get broken.

## Mounting and state

1. **Mount conditionally, never pass `open`.** `{open && <Modal … />}`. The Modal opens on mount and
   closes on unmount. Never set the `open` *attribute*: `<dialog open>` is non-modal — no top layer,
   no backdrop, nothing inert.
2. **The Modal never closes itself.** Every dismissal route calls
   `onRequestClose(reason: "escape" | "backdrop" | "close-button" | "native")`; the parent decides
   and unmounts. Do not call `.close()` from content, and never use `<button formmethod="dialog">`
   or `<form method="dialog">` — that closes the element behind React's back and bypasses the
   dirty rules (there is an `onClose` safety net, but do not rely on it).
3. **Sizes:** `sm` = confirm (max 28rem), `md` = a form (40rem), `lg` = a long searchable picker
   (64rem, fixed height so the list scrolls). Nothing else.
4. **Phones (<640px)** are automatic: `sm` stays centred, `md` becomes a bottom sheet (actions in
   thumb reach, context still visible), `lg` goes fullscreen (a long list in a letterbox is
   unusable). Override with `mobile` only with a reason.

## Focus

5. **Default initial focus is the dialog itself** (it has `tabIndex={-1}`), so a screen reader
   announces "<title>, dialog" and no phone keyboard covers the content. Pass `initialFocus` when
   the dialog has one obvious job: the search box of a picker, `Cancel` on a destructive confirm
   (what `ConfirmDialog` does).
6. **Do not add a focus trap.** A modal `<dialog>` inerts the rest of the document; Tab cannot
   reach the page behind it. Verified, not assumed.
7. **Focus return is ours, not the platform's.** The browser restores focus on `close()` only while
   the dialog is still in the document — React unmounts it, so the native restore does nothing.
   Modal captures `document.activeElement` before `showModal()` and restores it on unmount. If the
   trigger itself disappears (row deleted), pass `returnFocusTo`.

## Dismissal

8. **Escape** fires `cancel`, which Modal always `preventDefault()`s and turns into
   `onRequestClose("escape")`. React routes `cancel`/`close` through the React tree, so the handler
   checks `e.target` — a nested dialog's Escape must not close its parent.
9. **Backdrop click** is not native: Modal detects it from pointer coordinates outside the dialog
   box, and requires pointerdown *and* pointerup outside (so text selection dragged out of the
   dialog does not close it, and Chrome reporting a native `<select>` popup as the dialog does not
   either).
10. **A dirty dialog ignores backdrop clicks** and says so in a live region. A backdrop click
    carries no intent and is the commonest accidental dismissal; Escape and ✕ are deliberate, so
    they still reach `onRequestClose` and the parent decides.
11. **Never silently discard work.** On a dirty close, do what the rest of the app does
    (`UnsavedChangesBanner`): `setDraft({ id, label, kind, resume, discard, payload })` and close.
    The banner then offers Continue editing / Discard. Do not stack a confirm dialog on a form
    dialog.
12. **`busy`** (request in flight) disables every dismissal route, including ✕.
13. **Keep the ✕.** Phones have no Escape key and a backdrop tap is not discoverable. Only use
    `hideCloseButton` when the footer already has a visible Cancel.

## Nesting

14. **One level of nesting, for pickers only.** A form dialog may open a picker that returns a
    value ("Assign plan" → "Add exercise"); the top layer stacks correctly, Escape closes only the
    topmost, and the outer dialog is inerted by the browser. Anything deeper means the flow is a
    wizard: swap content inside one dialog (`step` state) instead. Modal warns in the console at
    depth 3. The dirty rules belong to the dialog that owns the data, not to the picker.

## ARIA

15. Modal supplies `aria-labelledby` (the `<h2>`) and `aria-describedby` (the optional
    description). **Do not add `role="dialog"` or `aria-modal="true"`** — a modal `<dialog>` already
    has both, and a hand-written `aria-modal` is how a dialog ends up lying to screen readers.
16. Give every dialog a `title` that is a real accessible name; tests query by it.

## Layout, scrolling, z-index

17. The dialog is a 3-row grid: header / scrolling body / pinned footer. Content goes in `children`,
    actions in `footer`. The body is the **only** scroll container (`overflow-y-auto
    overscroll-contain`); never make the whole dialog scroll.
18. Body scroll lock is ref-counted in Modal: `overflow: hidden` on `<html>` plus
    `scrollbar-gutter: stable` (or a `padding-inline-end` fallback) only when a classic scrollbar is
    actually taking width — so no layout shift and no shift back.
19. **z-index scale: 10** in-card, **20** bottom tab bar, **30** menus and toasts, **50** overlay
    layer. Never `z-[9999]`. A modal `<dialog>` is in the top layer and beats every z-index anyway;
    `z-50` on the shell is only a rung for sticky headers *inside* the dialog.
20. Backdrop is styled with Tailwind's `backdrop:` variant using theme tokens
    (`backdrop:bg-header/60`, same as `ConfirmDialog`). Custom properties used there must come from
    `:root` (theme.css) — older engines do not inherit them onto `::backdrop` from the dialog.
21. Heights use `svh`, not `vh`, so mobile browser chrome does not clip the footer; the footer adds
    `env(safe-area-inset-bottom)`.
22. Chrome's UA stylesheet caps a dialog at `calc(100% - 6px - 2em)`. Edge-to-edge sheets need
    `max-w-none` (already in Modal) or they come out ~38px narrow.

## Testing (Playwright)

23. Query by role: `page.getByRole("dialog", { name: "Assign plan" })`, then scope everything inside
    it: `dialog.getByRole("button", { name: "Save" })`. The accessible name comes from rule 15.
24. A closed dialog is **unmounted**, so assert `await expect(page.getByRole("dialog")).toHaveCount(0)`
    rather than `not.toBeVisible()`.
25. **Backdrop clicks cannot be done with a locator** — `dialog.click()` lands in the content box.
    Use `page.mouse.click(5, 5)`.
26. Playwright *does* respect the inert page: clicking a button behind an open dialog fails with
    "intercepts pointer events" after a 30s timeout. That is the dialog still being open — close it
    first; do not reach for `force: true`.
27. Tab-order tests should ignore `document.body`: tabbing past the last control hands focus to
    browser chrome, so `activeElement` is `body` for one step. Assert that focus never lands on a
    page element outside the dialog, not that it is always inside.
28. `page.evaluate(() => window.scrollTo(…))` still scrolls a locked page (programmatic scrolling
    is not blocked by `overflow: hidden`). Test the lock with `page.mouse.wheel()`.
