// Public landing page (Prompt 37 shell). Copy uses shipped v1 facts only: no prices,
// testimonials, user counts or unreleased features.
import { Suspense, lazy, useEffect, useState } from "react";
import "./landing.css";
import Faq from "./Faq";
import { LiveSheetHero } from "./LiveSheetHero";
import { Hero, TrainingLogBand } from "./Hero";
import LeadForm from "./LeadForm";
import Pricing from "./Pricing";

// The scroll story (with GSAP) is its own lazy chunk, so it never delays the hero.
const Story = lazy(() => import("./Story"));
const DemoWidget = lazy(() => import("./DemoWidget"));

const NAV = [
  ["Features", "#features"],
  ["Demo", "#demo"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
] as const;

function useScrolledPast(px: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > px);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [px]);
  return past;
}

/** The classic 3D hero (Prompt 38) is kept and still works at /?hero=3d. */
function wants3DHero() {
  return new URLSearchParams(window.location.search).get("hero") === "3d";
}

function Header({ dark }: { dark: boolean }) {
  const solid = useScrolledPast(40);
  return (
    <header className={`a1-header sticky top-0 z-20 ${dark ? "a1-header-dark" : ""}`} data-solid={solid}>
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center gap-4 px-5 md:px-8">
        <a href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="Repsy home">
          <img src="/favicon.png" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="a1-wordmark" aria-hidden="true">
            Repsy
          </span>
        </a>
        <nav aria-label="Landing" className="ml-auto hidden items-center gap-1 sm:flex">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="a1-navlink">
              {label}
            </a>
          ))}
        </nav>
        <a href="/app" className="a1-navcta ml-auto sm:ml-3">
          Start free <span aria-hidden="true">→</span>
        </a>
      </div>
    </header>
  );
}

const ROSTER = [
  { name: "Arjun Mehta", lines: ["Muscle gain · Beginner", "Weight 62.0 kg", "Plan: full-body day"], style: "a1-card-1" },
  { name: "Casey Jordan", lines: ["Marathon prep · Advanced", "Weight 74.0 kg", "Plan: runner strength"], style: "a1-card-2" },
  { name: "Maya Patel", lines: ["Fat loss + strength", "Adherence 86%", "Plan: lower-body day"], style: "a1-card-3" },
];

/** "One card per client": every client keeps their own plans, check-ins and chat. */
function RosterBoard() {
  return (
    <section aria-labelledby="roster-title" className="landing-dark overflow-x-clip py-24 md:py-32">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 px-5 md:px-8 lg:grid-cols-2">
        <div>
          <p className="l-kicker">One card per client</p>
          <h2 id="roster-title" className="l-h2 mt-4">
            Your whole roster, <em className="a1-orange">on one board.</em>
          </h2>
          <p className="mt-5 max-w-[40ch] text-lg leading-relaxed text-white/80">
            Every client keeps their own goal, plans, check-ins and AI chat. Switch clients and
            nothing leaks across.
          </p>
        </div>
        <ul className="a1-cards" aria-label="Example client cards">
          {ROSTER.map((c) => (
            <li key={c.name} className={`a1-index ${c.style}`}>
              <h3 className="a1-index-name">{c.name}</h3>
              {c.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Section({ id, n, kicker, title, children }: { id: string; n: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="landing-cream scroll-mt-16 py-20 md:py-28">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <p className="l-kicker">
          {n} — {kicker}
        </p>
        <h2 id={`${id}-title`} className="l-h2 mt-3 max-w-3xl">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

export default function Landing() {
  const [classic] = useState(wants3DHero);
  useEffect(() => {
    document.title = "Repsy Coach - AI planning help for fitness coaches";
  }, []);
  return (
    <div className="landing-cream a1 min-h-screen">
      <Header dark={classic} />
      <main>
        {classic ? <Hero /> : <LiveSheetHero />}
        <TrainingLogBand />
        <Suspense fallback={<div id="features" className="min-h-[60vh]" />}>
          <Story />
        </Suspense>
        <RosterBoard />
        <Section id="demo" n="05" kicker="Live demo" title="Try the idea in 30 seconds">
          <p className="landing-dim mt-4 max-w-2xl text-lg">
            Pick a sample client, ask for a plan and watch it get assigned with its reasoning. This
            demo runs in your browser only - no sign-up, nothing sent or saved.
          </p>
          <Suspense fallback={<div className="landing-card mt-6 min-h-80" />}>
            <DemoWidget />
          </Suspense>
          <a href="/app" className="l-link mt-8 inline-flex min-h-10 items-center text-sm font-bold uppercase tracking-wider underline decoration-2 underline-offset-[6px]">
            Try it in the app
          </a>
        </Section>
        <Section id="pricing" n="06" kicker="Pricing" title="Simple monthly plans">
          <Pricing />
        </Section>
        <Section id="faq" n="07" kicker="Questions" title="FAQ">
          <Faq />
        </Section>
        <Section id="start" n="08" kicker="Start free" title="Get your free trial">
          <p className="landing-dim mt-4 max-w-2xl text-lg">
            Leave your name and email and we'll set you up. In the meantime, the app is open with
            sample data.
          </p>
          <LeadForm />
        </Section>
      </main>
      <footer className="landing-dark">
        <div className="mx-auto max-w-[1200px] px-5 pt-16 md:px-8">
          {/* Decorative oversized wordmark (SVG, so it isn't read or contrast-checked as text). */}
          <svg viewBox="0 0 600 140" className="h-auto w-full max-w-3xl" aria-hidden="true" focusable="false">
            <text x="0" y="112" fill="#262626" style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 150, letterSpacing: "-0.03em" }}>
              Repsy
            </text>
          </svg>
        </div>
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-5 py-8 text-sm md:px-8">
          <span className="text-white/70">Repsy Coach</span>
          <nav aria-label="Legal" className="ml-auto flex gap-1">
            {["Privacy", "Terms", "Contact"].map((label) => (
              <a key={label} href={`#${label.toLowerCase()}`} className="flex min-h-10 items-center rounded-lg px-3 text-white/80 hover:text-white" title={`${label} - coming soon`}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
