# Landing page design: A1 · Clipboard

Approved by the user in Nov 2026 from three concepts (A Logbook, B Scoreboard, C Coach's Desk)
and then three variations of A (A1 Clipboard, A2 Spread, A3 Print-out). The earlier
ui-ux-pro-max pass ("editorial grid") set the foundations: numbered kickers, hard rules, no
glass or gradient blobs.

**Idea:** a coach's clipboard. The hero is one client's session sheet clipped to a board, with
the AI suggestion stuck on as a note that says *why*. The product's difference (plans that
carry their reasoning) is the picture, not a caption.

**Hero variants:** `/` shows the clipboard (`ClipboardHero.tsx`, pure HTML/CSS, no 3D
download). The Prompt 38 3D hero is kept and still works at `/?hero=3d` (`Hero.tsx`,
`Hero3D.tsx`), and the bundle guard still checks that its chunk stays lazy.

## Rules

| Area | Rule |
|---|---|
| Type | Instrument Serif headlines, sentence case, tight tracking; *italic orange* for the one key word. Geist body. Geist Mono for sets, reps, rest, weights and kickers. Caveat only for tiny decorative pen notes (`aria-hidden`). |
| Colour | Cream `#FAF7F2` paper and `#141414` ink, one accent (orange `#FF4A1F`). Teal only for data and ticks. Paper tints come from existing tokens via `rgba()` / `color-mix()`; never new hex values. |
| Objects | Real paper things only: graph paper, clipboard, sticky note, ruled index cards, a ruled notebook list with a red margin. Each object shows real product data (Manual Planner notation `Back Squat 4 × 6 · Rest 120s`, the Maya / Arjun / Casey samples). |
| Buttons | Orange pill with dark text and a hard `0 4px 0 #141414` shadow (`.a1-btn`). Header CTA is a dark pill with an orange arrow. Secondary actions are underlined text links. |
| Layout | One 1200px grid (`max-w-[1200px] px-5 md:px-8`) for header, hero, sections and footer, so every left edge lines up. Section rhythm `py-20 md:py-28`. |
| Motion | Small and CSS-only in the hero: the underline draws, ticks pop, the note drops on. All off under `prefers-reduced-motion`. Story animations stay in the lazy GSAP chunk. |
| Avoid | Emoji icons, stock "trusted by" strips, fake metrics, testimonials, glass, glow, purple gradients, centred-everything layouts, three identical icon cards. |
