// Scroll motion for the Studio landing. Only this lazy chunk imports GSAP (CLAUDE.md: gsap is
// allowed in the landing only, lazily). Everything here is progressive: the markup is a complete
// still page, and this file only animates it on wide screens without reduced motion.
//
// Scenes:
//  - hero: the plan sheet straightens, scales, tears into 4 strips that fan out, each stamped DONE
//  - ribbon: the promise slides along the curved band as you scroll
//  - road: the white road draws itself (stroke-dashoffset) as the section passes
//  - notebook: pinned; beats change, scribbles appear, a big X strikes through, the page
//    flips away and the app card takes its place
//  - [data-rise] blocks fade up, [data-pop] items pop in, [data-draw] paths draw, [data-fill] bars fill
// Scrolling itself stays native (no smooth-scroll wrapper), so keyboard, find-in-page and
// screen readers behave normally; scrub values give the scenes their soft, eased follow.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const DRAW_LEN = 1000;

/** Prepare paths to "draw": a normalised length, so a path that is rebuilt later (the road
 * redraws on resize) still draws exactly start to end without re-measuring. */
function drawPrep(paths: SVGPathElement[]) {
  // gsap.set (inside the context) so ctx.revert() puts the paths back fully drawn. The length is
  // 1000, not 1: GSAP rounds px values to whole numbers, so 0-1 would snap instead of drawing.
  gsap.set(paths, { attr: { pathLength: DRAW_LEN }, strokeDasharray: DRAW_LEN, strokeDashoffset: DRAW_LEN });
}

export function startMotion(root: HTMLElement): () => void {
  // Layered/hidden scene states in the CSS apply only while this class is on (see landing-new.css).
  root.classList.add("ln-anim");
  let disposed = false;
  let mmRef: gsap.MatchMedia | undefined;
  const ctx = gsap.context(() => {
    const q = <T extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)] as T[];

    /* Hero tear needs the side-by-side layout (lg+); below that the stacked hero is taller than the
     * screen, so it stays a still sheet. gsap.matchMedia builds / removes it as the width changes. */
    const mm = gsap.matchMedia();
    mmRef = mm;
    mm.add("(min-width: 1024px)", () => {
      /* ---------- hero: one sheet, four strips, four DONE stamps ---------- */
      const hero = root.querySelector<HTMLElement>("[data-scene=hero]");
      const stage = root.querySelector<HTMLElement>("[data-sheet-stage]");
      if (hero && stage) {
        const strips = q("[data-strip]");
        const labels = q("[data-strip-label]");
        const stamps = q("[data-stamp]");
        const chips = q("[data-strip-chip]");
        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: { trigger: hero, start: "top top", end: "+=1300", pin: "[data-hero-pin]", scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true },
        });
        tl.to(stage, { rotate: 0, scale: 1.04, x: 48, duration: 0.6 })
          .to("[data-hero-note]", { autoAlpha: 0, duration: 0.3 }, "<")
          .to("[data-hero-copy]", { opacity: 0.25, duration: 0.6 }, "<0.2");
        const spread = [-1.5, -0.5, 0.5, 1.5];
        const copy = root.querySelector<HTMLElement>("[data-hero-copy]");
        const column = stage.parentElement!;
        // How far apart the strips fan (fraction of the sheet's width per step), from the real room
        // between the text column and the sheet, so the left strip never covers the copy. Measured
        // on untransformed elements; re-run on every refresh (invalidateOnRefresh).
        const fan = () => {
          const W = stage.offsetWidth;
          const col = column.getBoundingClientRect();
          const c = copy?.getBoundingClientRect();
          const sheetLeft = col.left + (col.width - W) / 2 + 48;
          // The outer strips tilt 6.75deg, which widens their footprint by about H * sin(6.75deg) / 2.
          const tilt = stage.offsetHeight * 0.06;
          const limit = (c && c.right <= col.left + 1 ? c.right + 24 : 16) + tilt;
          return Math.max(0, Math.min(0.25, (sheetLeft - limit) / (1.5 * W)));
        };
        strips.forEach((s, i) => {
          tl.to(s, { xPercent: () => spread[i] * fan() * 100, y: i % 2 ? 26 : -18, rotate: spread[i] * 4.5, duration: 1 }, 0.7);
        });
        // Strips are full-width layers (clipped), so xPercent moves them by the sheet's width. The
        // labels are quarter-width, so they get the same offset in pixels to stay on their strip.
        labels.forEach((l, i) => {
          tl.to(l, { x: () => stage.offsetWidth * spread[i] * fan(), y: i % 2 ? 26 : -18, rotate: spread[i] * 4.5, duration: 1 }, 0.7);
        });
        tl.fromTo(stamps, { autoAlpha: 0, scale: 2.4, rotate: -30 }, { autoAlpha: 1, scale: 1, rotate: -12, ease: "back.out(2.6)", stagger: 0.14, duration: 0.35 }, 1.55);
        tl.fromTo(chips, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, stagger: 0.1, duration: 0.3 }, 1.7);
        tl.to("[data-hero-copy]", { opacity: 1, duration: 0.4 }, 1.9);
      }
    });

    /* ---------- ribbon: slide the promise along the curve ---------- */
    const ribbon = root.querySelector<SVGTextPathElement>("[data-ribbon]");
    if (ribbon) {
      gsap.fromTo(
        ribbon,
        { attr: { startOffset: "0%" } },
        {
          attr: { startOffset: "-60%" },
          ease: "none",
          scrollTrigger: { trigger: ribbon.closest("div"), start: "top bottom", end: "bottom top", scrub: 0.6 },
        },
      );
    }

    /* ---------- road: draws itself as the section scrolls past ---------- */
    const road = root.querySelector<SVGPathElement>("[data-road]");
    const clip = root.querySelector<SVGRectElement>("[data-road-clip]");
    if (road) {
      drawPrep([road]);
      if (clip) gsap.set(clip, { attr: { height: 0 } });
      gsap.to(road, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: { trigger: "[data-scene=road]", start: "top 70%", end: "bottom 80%", scrub: 0.5 },
        onUpdate() {
          if (!clip) return;
          const p = road.getPointAtLength(road.getTotalLength() * this.progress());
          clip.setAttribute("height", String(Math.max(0, p.y + 24)));
        },
      });
    }

    /* ---------- notebook: pinned old way -> Repsy ---------- */
    const nb = root.querySelector<HTMLElement>("[data-scene=notebook]");
    if (nb) {
      const beats = q("[data-beat]");
      const strikes = q<SVGPathElement>("[data-strike]");
      drawPrep(strikes);
      const tl = gsap.timeline({
        defaults: { ease: "power1.inOut" },
        scrollTrigger: { trigger: nb, start: "top top", end: "+=2600", pin: "[data-nb-pin]", scrub: 0.7, anticipatePin: 1 },
      });
      const swap = (from: number, to: number, at: number) => {
        tl.to(beats[from], { autoAlpha: 0, y: -24, duration: 0.3 }, at).fromTo(beats[to], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.3 }, at + 0.15);
      };
      gsap.set(beats.slice(1), { autoAlpha: 0 });
      swap(0, 1, 0.5);
      tl.to("[data-nb-layer='1']", { autoAlpha: 1, duration: 0.3, stagger: 0.1 }, 0.6);
      swap(1, 2, 1.4);
      tl.to("[data-nb-layer='2']", { autoAlpha: 1, duration: 0.3, stagger: 0.1 }, 1.5);
      swap(2, 3, 2.3);
      tl.to(strikes, { strokeDashoffset: 0, duration: 0.35, stagger: 0.18 }, 2.4);
      tl.to("[data-nb-book]", { rotateY: -100, transformOrigin: "left center", autoAlpha: 0, duration: 0.6, ease: "power2.in" }, 3.1);
      swap(3, 4, 3.2);
      tl.fromTo("[data-nb-app]", { autoAlpha: 0, rotateY: 40, scale: 0.92 }, { autoAlpha: 1, rotateY: 0, scale: 1, duration: 0.6, ease: "power2.out" }, 3.45);
      tl.to({}, { duration: 0.4 });
    }

    /* ---------- generic reveals ---------- */
    for (const el of q("[data-rise]")) {
      gsap.from(el, { y: 46, autoAlpha: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    }
    const popGroups = new Map<Element, HTMLElement[]>();
    for (const el of q("[data-pop]")) {
      const g = el.closest("section") ?? root;
      popGroups.set(g, [...(popGroups.get(g) ?? []), el]);
    }
    for (const [g, els] of popGroups) {
      gsap.from(els, { scale: 0.6, autoAlpha: 0, duration: 0.45, stagger: 0.07, ease: "back.out(2)", scrollTrigger: { trigger: g, start: "top 70%", once: true } });
    }
    for (const svg of q<SVGPathElement>("[data-draw]")) {
      drawPrep([svg]);
      gsap.to(svg, { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut", scrollTrigger: { trigger: svg.closest("svg"), start: "top 85%", once: true } });
    }
    for (const bar of q("[data-fill]")) {
      gsap.from(bar, { width: 0, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: bar, start: "top 90%", once: true } });
    }
    for (const scan of q("[data-scan]")) {
      // Three sweeps (about 4 s), then it stops: under WCAG 2.2.2's 5-second limit, so no pause needed.
      gsap.fromTo(
        scan,
        { top: "3.5rem", autoAlpha: 0 },
        { top: "9rem", autoAlpha: 0.9, duration: 1.4, ease: "sine.inOut", repeat: 2, yoyo: true, scrollTrigger: { trigger: scan, start: "top 85%", once: true }, onComplete: () => gsap.to(scan, { autoAlpha: 0, duration: 0.4 }) },
      );
    }
  }, root);

  // Fonts and the road's layout settle after first paint; recompute pins and lengths then.
  const refresh = () => {
    if (!disposed) ScrollTrigger.refresh();
  };
  document.fonts?.ready.then(refresh);
  window.addEventListener("load", refresh);

  return () => {
    disposed = true;
    window.removeEventListener("load", refresh);
    mmRef?.revert();
    ctx.revert();
    root.classList.remove("ln-anim");
  };
}
