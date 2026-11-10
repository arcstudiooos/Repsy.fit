// Public landing page (Prompt 37 shell). Copy uses shipped v1 facts only: no prices,
// testimonials, user counts or unreleased features.
import { Suspense, lazy, useEffect, useState } from "react";
import "./landing.css";
import { Hero, TrainingLogBand } from "./Hero";

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

function Header() {
  const solid = useScrolledPast(40);
  return (
    <header
      className={`sticky top-0 z-20 transition-colors ${solid ? "landing-dark shadow-md" : "bg-transparent text-white"}`}
    >
      <div className="mx-auto flex max-w-[1100px] items-center gap-4 px-4 py-3">
        <a href="/" className="flex shrink-0 items-center rounded-lg" aria-label="Repsy home">
          <img src="/favicon.png" alt="" width={36} height={36} className="h-9 w-9" />
        </a>
        <nav aria-label="Landing" className="ml-auto hidden items-center gap-1 sm:flex">
          {NAV.map(([label, href]) => (
            <a key={href} href={href} className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-white/85 hover:text-white">
              {label}
            </a>
          ))}
        </nav>
        <a href="/app" className="btn-primary ml-auto flex min-h-10 items-center rounded-lg px-4 text-sm sm:ml-2">
          Start free
        </a>
      </div>
    </header>
  );
}

function Section({ id, n, kicker, title, children }: { id: string; n: string; kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="landing-cream scroll-mt-16 py-20 md:py-28">
      <div className="mx-auto max-w-[1100px] px-4">
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
  useEffect(() => {
    document.title = "Repsy Coach - AI planning help for fitness coaches";
  }, []);
  return (
    <div className="landing-cream min-h-screen">
      <Header />
      <main>
        <Hero />
        <TrainingLogBand />
        <Suspense fallback={<div id="features" className="min-h-[60vh]" />}>
          <Story />
        </Suspense>
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
        <Section id="pricing" n="06" kicker="Pricing" title="Pricing">
          <p className="landing-dim mt-3">Pricing is coming soon.</p>
        </Section>
        <Section id="faq" n="07" kicker="Questions" title="FAQ">
          <p className="landing-dim mt-3">Answers to common questions are coming soon.</p>
        </Section>
      </main>
      <footer className="landing-dark">
        <div className="mx-auto max-w-[1100px] px-4 pt-16">
          <p className="l-display text-white/10 select-none" aria-hidden="true">
            Repsy
          </p>
        </div>
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-4 px-4 py-8 text-sm">
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
