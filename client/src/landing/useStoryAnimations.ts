// GSAP scroll animations for the landing story (Prompt 39). Landing only - never imported by /app.
// Rules: each animation plays ONCE when its section enters; prefers-reduced-motion shows the
// final state with no motion; only the AI Coach mock is pinned, and only on desktop; everything
// is reverted on unmount. The HTML is already in its final state, so "no animation" = final.
import { useLayoutEffect, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const once = (trigger: Element, start = "top 75%") => ({ trigger, start, once: true });

export function useStoryAnimations(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const section = (name: string) => el.querySelector(`[data-story=${name}]`)!;

    const mm = gsap.matchMedia();
    mm.add(
      {
        desktop: "(min-width: 768px) and (prefers-reduced-motion: no-preference)",
        mobile: "(max-width: 767px) and (prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const { desktop } = ctx.conditions as { desktop: boolean; mobile: boolean };
        el.dataset.animated = "pending";

        // 1. Problem strip: cards fade / rise in a stagger.
        gsap.from(q("[data-anim=pain]"), { opacity: 0, y: 40, duration: 0.7, stagger: 0.15, ease: "power2.out", scrollTrigger: once(section("problem")) });

        // 2. AI Coach: the mock tilts in (rotateX), then the chat bubbles type in one by one.
        const bubbles = q("[data-anim=bubble]") as HTMLElement[];
        const ai = gsap.timeline({ scrollTrigger: once(section("ai"), desktop ? "top 60%" : "top 75%") });
        ai.from(q("[data-anim=mock]"), desktop ? { rotateX: 28, y: 60, opacity: 0.3, transformOrigin: "50% 100%", duration: 1, ease: "power3.out" } : { opacity: 0, y: 30, duration: 0.6 });
        bubbles.forEach((b) => {
          const full = b.dataset.full ?? "";
          const typed = { n: 0 };
          ai.set(b, { opacity: 1 });
          ai.to(typed, {
            n: full.length,
            duration: Math.min(1.6, full.length * (desktop ? 0.018 : 0.008)),
            ease: "none",
            onStart: () => {
              b.textContent = "";
            },
            onUpdate: () => {
              b.textContent = full.slice(0, Math.round(typed.n));
            },
            onComplete: () => {
              b.textContent = full;
            },
          });
        });
        ai.from(q("[data-anim=suggestion]"), { opacity: 0, y: 20, duration: 0.5 });
        // Hide the bubbles until their turn (but keep their space, so nothing jumps).
        gsap.set(bubbles, { opacity: 0 });

        // Pin the AI Coach section (desktop only) while its story plays.
        if (desktop) ScrollTrigger.create({ trigger: section("ai"), start: "top top", end: "+=60%", pin: true });

        // 3. Manual Planner: rows fly in from both sides and assemble into the numbered list.
        gsap.from(q("[data-anim=row]"), {
          opacity: 0,
          x: (i) => (i % 2 ? 1 : -1) * (desktop ? 120 : 40),
          rotation: (i) => (i % 2 ? 1 : -1) * (desktop ? 6 : 2),
          duration: 0.7,
          stagger: 0.18,
          ease: "back.out(1.4)",
          scrollTrigger: once(section("planner")),
        });

        // 4. Progress: lines draw themselves and the numbers count up.
        gsap.from(q("[data-anim=line]"), { strokeDashoffset: 1, duration: 1.6, stagger: 0.3, ease: "power2.inOut", scrollTrigger: once(section("progress")) });
        (q("[data-anim=count]") as HTMLElement[]).forEach((c) => {
          const to = Number(c.dataset.to);
          const decimals = Number(c.dataset.decimals ?? 0);
          const suffix = c.dataset.suffix ?? "";
          const v = { n: 0 };
          c.textContent = (0).toFixed(decimals) + suffix; // counts up from 0 when the section enters
          gsap.to(v, {
            n: to,
            duration: 1.4,
            ease: "power1.out",
            scrollTrigger: once(section("progress")),
            onUpdate: () => {
              c.textContent = v.n.toFixed(decimals) + suffix;
            },
            onComplete: () => {
              c.textContent = to.toFixed(decimals) + suffix;
            },
          });
        });

        el.dataset.animated = "ready";
        // On revert (unmount, or a media change such as reduced-motion turning on), restore
        // every final text so the page never stays half-typed or half-counted.
        return () => {
          bubbles.forEach((b) => (b.textContent = b.dataset.full ?? ""));
          (q("[data-anim=count]") as HTMLElement[]).forEach((c) => {
            c.textContent = Number(c.dataset.to).toFixed(Number(c.dataset.decimals ?? 0)) + (c.dataset.suffix ?? "");
          });
          delete el.dataset.animated;
        };
      },
    );
    return () => mm.revert();
  }, [root]);
}
