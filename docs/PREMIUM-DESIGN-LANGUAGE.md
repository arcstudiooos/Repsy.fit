# Repsy — premium design language

Refereed from the four-persona roundtables (web designer, lead PM, graphic designer, coach/client
user) during the Calendar redesign, and consistent with the rebuilt Home and Clients screens. Every
remaining screen is held to this bar. These rules are in addition to `CLAUDE.md`, which still binds.

## 1. Hierarchy comes from space and type, never from stacked boxes

- The "everything looks like a box" complaint is the root problem: nested filled containers
  (panel → filled column → filled card → filled control) flatten hierarchy and read as boxes.
- Group with a **4/8px spacing rhythm** (8px between related lines, 16px card/row padding, 24px
  between items, 32–40px between sections) and **one `border-border` hairline**. No filled bands to
  separate empty regions; no decorative shadows, offset edges or gradients.
- Each surface has **one anchor**: one semibold title in `text-text`, at most one supporting
  `text-dim` line. No bold-on-bold. Sections follow the Home pattern: small icon + title + one-line
  subtitle.
- Empty containers collapse to nothing (desktop) or one quiet tappable line with a single action
  (phone). There are no empty cards, no debug text and no "v1" footers.

## 2. Numbers are data

- **All numerals `tabular-nums`, never `font-mono`.** Geist Mono's slashed zero reads as a letter;
  monospace makes a scheduling or stats screen look like a terminal.
- Times, counts, adherence, weights and dates align in a quiet gutter/tabular run so columns scan.

## 3. Accent discipline

- `bg-accent` (orange) = **the single primary action per view**, nothing else — not selected states,
  not "today", not decoration.
- `bg-accent2`/`text-accent2` = selection, today and progress (progress as an `accent2` fill on a
  `bg-surface2` track).
- `text-amber`/`bg-amber` = at-risk, cancelled, no-show and destructive actions.
- `type-*` fills and their `*-text` twins = type identity only, always **with a text label** —
  colour is never the sole carrier of meaning.
- All colour is **token-only**. No raw hex in a component, no invented `-soft` tints (they do not
  exist): pair `bg-surface2` with a coloured `*-text`. Any genuinely new colour must be added to all
  three theme blocks with light + dark values and a contrast check.

## 4. Reach and feedback

- Every interactive target ≥44px, with a real accessible name, semantic role, keyboard path and a
  visible focus ring. Modals and menus use the native `<dialog>` `Modal` component.
- A frequent destructive action is confirmed or reversible (Undo toast), never one mis-tap away.
- Replace generic default controls (full-width native `<select>`) with a labelled chip/pill that
  opens a proper dialog of large, labelled options.
- Motion is 150–200ms ease-out on opacity/transform for dialog/menu open and state changes; no
  bounce, no stagger; honour `prefers-reduced-motion`.

## 5. One obvious primary action; capabilities relocate, never vanish

- One primary action per screen; secondary actions are labelled buttons or a labelled menu.
- "Nothing to be missed" means relocating a capability to the right place, not deleting it: set-once
  config goes behind one button, low-frequency actions go into dialogs, at-risk state is shown on
  the item itself rather than in a duplicate panel.
- Show global invariants (timezone, kg) once, in one quiet line — not per row.
