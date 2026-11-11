// Repsy landing, "Studio" design (Nov 2026): a monochrome, scroll-scene landing in the style of
// the owner's reference site, with Repsy's own story, copy and product. Lazy chunk; GSAP is only
// loaded (as a further lazy chunk) on wide screens without reduced motion.
import { useEffect, useRef, useState } from "react";
import { NAV } from "./content";
import { Icon } from "./icons";
import { Compare, Currency, Done, FaqChat, Get, Hero, Intro, More, OldWay, Pricing, Ribbon, Road } from "./scenes";
import "./landing-new.css";

const WIDE = "(min-width: 768px)";
const STILL = "(prefers-reduced-motion: reduce)";

function useMedia(q: string) {
  const [on, setOn] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setOn(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return on;
}

/** A dot that follows the mouse and grows over links (fine pointers only, decorative). */
function DotCursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let x = -100;
    let y = -100;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX;
      y = e.clientY;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
      const t = e.target as Element | null;
      el.classList.toggle("is-big", !!t?.closest("a, button"));
    };
    const leave = () => (el.style.opacity = "0");
    const enter = () => (el.style.opacity = "1");
    const html = document.documentElement;
    window.addEventListener("pointermove", move);
    html.addEventListener("mouseleave", leave);
    html.addEventListener("mouseenter", enter);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      html.removeEventListener("mouseleave", leave);
      html.removeEventListener("mouseenter", enter);
    };
  }, []);
  return <div ref={ref} className="ln-cursor" aria-hidden="true" />;
}

function Nav() {
  return (
    <header className="ln-nav">
      <a href="#top" className="ln-logo" aria-label="Repsy, back to top">
        Repsy<span aria-hidden="true">.</span>
      </a>
      <nav aria-label="Sections" className="ln-links">
        {NAV.map((n) => (
          <a key={n.href} href={n.href}>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <span className="ln-links !flex">
          <a href="/login">
            <span className="sr-only">Coach </span>Log in
          </a>
        </span>
        <a href="#get" className="ln-cta">
          <span className="ln-cta-dot">
            <Icon name="arrow" size={16} />
          </span>
          Start free
        </a>
      </div>
    </header>
  );
}

function Footer() {
  const cols: [string, [string, string][]][] = [
    ["Product", [["How it works", "#how"], ["Pricing", "#pricing"], ["FAQ", "#faq"]]],
    ["Account", [["Coach log in", "/login"], ["Start free", "/register"], ["Client sign in", "/client/login"]]],
    ["Legal", [["Privacy", "/privacy"], ["Terms", "/terms"]]],
  ];
  return (
    <footer className="ln-wrap overflow-hidden pb-8 pt-20">
      <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <p className="ln-display text-[1.6rem]">Repsy.</p>
          <p className="mt-3 max-w-xs text-[0.88rem]" style={{ color: "var(--mute)" }}>
            Coaching software for personal trainers: plans with the reasoning, check-ins that add up, and
            clients who need nothing but a link.
          </p>
        </div>
        {cols.map(([h, links]) => (
          <div key={h}>
            <p className="text-[0.72rem] font-bold uppercase tracking-wider" style={{ color: "var(--mute)" }}>
              {h}
            </p>
            <ul className="mt-3 space-y-1">
              {links.map(([l, href]) => (
                <li key={l}>
                  <a href={href} className="inline-flex min-h-9 items-center text-[0.9rem] font-medium hover:underline">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p
        aria-hidden="true"
        className="ln-display mb-10 mt-16 select-none text-center leading-[0.9] tracking-[-0.07em]"
        style={{ fontSize: "clamp(6rem, 27vw, 24rem)" }}
      >
        repsy
      </p>
      <div className="mt-6 flex flex-wrap justify-between gap-3 border-t pt-5 text-[0.78rem]" style={{ borderColor: "var(--line)", color: "var(--mute)" }}>
        <p>© {new Date().getFullYear()} Repsy. AI advice is general wellness guidance, not medical advice.</p>
        <p>Made for coaches who'd rather be coaching.</p>
      </div>
    </footer>
  );
}

export default function StudioLanding() {
  const root = useRef<HTMLDivElement>(null);
  const wide = useMedia(WIDE);
  const still = useMedia(STILL);
  const [paused, setPaused] = useState(false);
  const animate = wide && !still;

  useEffect(() => {
    document.title = "Repsy - coaching software for personal trainers";
  }, []);

  useEffect(() => {
    if (!animate || !root.current) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("./motion").then(({ startMotion }) => {
      if (!cancelled && root.current) stop = startMotion(root.current);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [animate]);

  return (
    <div ref={root} className={"ln" + (paused ? " is-paused" : "")} data-testid="studio-landing">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-20 focus:z-[70] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Nav />
      {animate && <DotCursor />}
      <main id="main">
        <Hero />
        <Ribbon />
        <Intro />
        <Road />
        <Currency />
        <More />
        <Compare />
        <Done />
        <OldWay />
        <Pricing />
        <FaqChat />
        <Get />
      </main>
      <Footer />
      {!still && (
        <button type="button" className="ln-pause" onClick={() => setPaused((p) => !p)}>
          <Icon name={paused ? "play" : "pause"} size={14} />
          {paused ? "Play motion" : "Pause motion"}
        </button>
      )}
    </div>
  );
}
