// Scroll motion for the Studio landing. Only this lazy chunk imports GSAP (CLAUDE.md: gsap is
// allowed in the landing only, lazily). Everything here is progressive: the markup is a complete
// still page, and this file only animates it on wide screens without reduced motion.
//
// Scenes:
//  - hero: the barbell loads one plate per plan type (and client), the bar whips, four ticks land
//  - ribbon: the promise slides along the curved band as you scroll
//  - road: the white road draws itself (stroke-dashoffset) as the section passes
//  - notebook: pinned; beats change, scribbles appear, a big X strikes through, the page
//    flips away and the app card takes its place
//  - [data-rise] blocks fade up, [data-pop] items pop in, [data-draw] paths draw, [data-fill] bars fill
// Scrolling itself stays native (no smooth-scroll wrapper), so keyboard, find-in-page and
// screen readers behave normally; scrub values give the scenes their soft, eased follow.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { barPath, sleeveTransform } from "./scenes";

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
      /* ---------- hero: the barbell loads, the collars lock, the bar whips, four ticks land ---------- */
      const hero = root.querySelector<HTMLElement>("[data-scene=hero]");
      const bar = root.querySelector<SVGPathElement>("[data-bar]");
      if (hero && bar) {
        const plates = q<SVGGElement>("[data-plate]");
        const collars = q<SVGGElement>("[data-collar]");
        const labels = q("[data-plate-label]");
        const ticks = q("[data-plate-tick]");
        const knurl = root.querySelector<SVGPathElement>("[data-bar-knurl]");
        const countN = root.querySelector<HTMLElement>("[data-hero-count-n]");
        const sleeves = q<SVGGElement>("[data-sleeve]");
        const sagOf = (n: number) => 4 + n * 3.5; // px of droop per plate loaded
        const bend = { sag: 0 };
        // The shaft bends as a curve; the sleeves (with their plates and collars) are rigid, so they
        // drop with the shaft's ends and tilt to its end slope - otherwise the bar looks broken.
        const setBar = () => {
          const d = barPath(bend.sag);
          bar.setAttribute("d", d);
          knurl?.setAttribute("d", d);
          const tf = sleeveTransform(bend.sag);
          for (const s of sleeves) s.setAttribute("transform", tf);
        };
        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: { trigger: hero, start: "top top", end: "+=1500", pin: "[data-hero-pin]", scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true },
        });
        // Start: an empty bar. Plates wait beyond the ends of the sleeves (the right sleeve group is
        // mirrored, so the same -x works for both sides); collars sit tight at the shoulders.
        // Each plate waits at the tip of its sleeve, invisible, and fades in as it slides on.
        const startX = (pl: Element) => -(216 - 29 * Number((pl as HTMLElement).dataset.plateIndex));
        plates.forEach((pl) => gsap.set(pl, { x: startX(pl), opacity: 0 }));
        gsap.set(collars, { x: 4 * (26 + 3) });
        gsap.set(labels, { autoAlpha: 0, y: 10 });
        gsap.set(ticks, { autoAlpha: 0, scale: 0.4 });
        const count = { n: 0 };
        const setCount = () => {
          if (countN) countN.textContent = String(Math.round(count.n));
        };
        setCount();
        tl.to("[data-hero-note]", { autoAlpha: 0, duration: 0.25 }, 0);
        // Load innermost first, both sides together.
        for (let i = 0; i < 4; i++) {
          const at = 0.3 + i * 0.5;
          const pair = plates.filter((p) => p.dataset.plateIndex === String(i));
          tl.to(pair, { x: 0, duration: 0.45, ease: "power3.out" }, at);
          tl.to(pair, { opacity: 1, duration: 0.12 }, at);
          tl.to(bend, { sag: sagOf(i + 1), duration: 0.35, ease: "elastic.out(1, 0.45)", onUpdate: setBar }, at + 0.3);
          tl.to(collars, { x: (4 - (i + 1)) * (26 + 3), duration: 0.3 }, at + 0.1);
          tl.to(labels[i], { autoAlpha: 1, y: 0, duration: 0.3 }, at + 0.2);
          tl.to(count, { n: i + 1, duration: 0.01, onUpdate: setCount, onReverseComplete: setCount }, at + 0.05);
        }
        // Lift: the bar comes up a touch, the shadow shrinks, the ticks land.
        tl.to("[data-barbell]", { y: -18, duration: 0.5, ease: "power2.out" }, 2.6);
        tl.to("[data-bar-shadow]", { attr: { rx: 300 }, opacity: 0.04, duration: 0.5 }, 2.6);
        tl.to("[data-hero-count]", { autoAlpha: 0, duration: 0.3 }, 2.8);
        tl.to(ticks, { autoAlpha: 1, scale: 1, stagger: 0.12, duration: 0.3, ease: "back.out(2.4)" }, 2.75);
        tl.to({}, { duration: 0.3 });
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
      const tiles = q("[data-nb-tile]");
      const threads = q<SVGLineElement>("[data-nb-thread]");
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
      // Enough: the threads snap, every tile is pulled into the centre and the tangle is gone.
      tl.to(threads, { opacity: 0, duration: 0.2, stagger: 0.03 }, 2.4);
      tl.to("[data-nb-layer]", { autoAlpha: 0, duration: 0.2 }, 2.4);
      tl.to(
        tiles,
        {
          left: "50%",
          top: "50%",
          xPercent: -50,
          yPercent: -50,
          rotate: () => gsap.utils.random(-30, 30),
          scale: 0.1,
          autoAlpha: 0,
          duration: 0.6,
          ease: "power3.in",
          stagger: 0.05,
        },
        2.55,
      );
      tl.to("[data-nb-book]", { autoAlpha: 0, duration: 0.2 }, 3.1);
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
