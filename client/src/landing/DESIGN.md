# Landing page design: A1 · Clipboard

Approved by the user in Nov 2026 from three concepts (A Logbook, B Scoreboard, C Coach's Desk)
and then three variations of A (A1 Clipboard, A2 Spread, A3 Print-out). The earlier
ui-ux-pro-max pass ("editorial grid") set the foundations: numbered kickers, hard rules, no
glass or gradient blobs.

**Idea:** a coach's planning sheet on graph paper. The hero plays the real Repsy flow on a
loop (`LiveSheetHero.tsx`): the coach asks about a client, the AI writes its reasoning on a
sticky note, the plan rows are written in, a cursor taps Assign and an "Assigned" stamp lands,
then the page turns to the next sample client (Maya, Arjun, Casey). The product's difference
(plans that carry their reasoning) is the picture, not a caption. It replaced the first,
static clipboard version because the user wanted more motion.

**Hero variants:** `/` shows the live sheet (pure React + CSS, no 3D download). The Prompt 38
3D hero is kept and still works at `/?hero=3d` (`Hero.tsx`, `Hero3D.tsx`), and the bundle
guard still checks that its chunk stays lazy.

**Motion rules for the live sheet:** a real "Pause animation" button (WCAG 2.2.2); the loop
pauses off-screen and in hidden tabs; reduced motion shows one finished, still frame with no
Pause button; every element keeps its space so the hero never changes height (no layout
shift); a gentle pointer tilt only on fine pointers.

## Rules

| Area | Rule |
|---|---|
| Type | (Whole product, landing + `/app`.) Instrument Serif headlines, sentence case, tight tracking; *italic orange* for the one key word. Geist body. Geist Mono for sets, reps, rest, weights and kickers. Caveat only for tiny decorative pen notes (`aria-hidden`). |
| Colour | Cream `#FAF7F2` paper and `#141414` ink, one accent (orange `#FF4A1F`). Teal only for data and ticks. Paper tints come from existing tokens via `rgba()` / `color-mix()`; never new hex values. |
| Objects | Real paper things only: graph paper, clipboard, sticky note, ruled index cards, a ruled notebook list with a red margin. Each object shows real product data (Manual Planner notation `Back Squat 4 × 6 · Rest 120s`, the Maya / Arjun / Casey samples). |
| Buttons | Orange pill with dark text and a hard `0 4px 0 #141414` shadow (`.a1-btn`). Header CTA is a dark pill with an orange arrow. Secondary actions are underlined text links. |
| Layout | One 1200px grid (`max-w-[1200px] px-5 md:px-8`) for header, hero, sections and footer, so every left edge lines up. Section rhythm `py-20 md:py-28`. |
| Motion | Hero motion is React + CSS only (typing, note drop, pen strokes, cursor, stamp, page turn). All off under `prefers-reduced-motion`. Story animations stay in the lazy GSAP chunk. |
| Avoid | Emoji icons, stock "trusted by" strips, fake metrics, testimonials, glass, glow, purple gradients, centred-everything layouts, three identical icon cards. |
