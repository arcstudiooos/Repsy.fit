// Public landing page (Prompt 37 shell). Copy uses shipped v1 facts only: no prices,
// testimonials, user counts or unreleased features.
import { useEffect, useState } from "react";
import "./landing.css";
import { Hero } from "./Hero";

const NAV = [
  ["Features", "#features"],
  ["Demo", "#demo"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
] as const;

const FEATURES = [
  {
    title: "AI Coach with reasoning",
    body: "Ask about a client and get an answer based on their goal, level, progress and plans. Suggested plans come with the reasoning behind them, and nothing is saved until you assign it.",
  },
  {
    title: "Manual Planner",
    body: "Build a workout from the exercise library with sets, reps and rest for each exercise, saved as a clear numbered plan. Mark plans Active, Done or Paused.",
  },
  {
    title: "Progress charts",
    body: "Weekly check-ins feed stat cards plus weight, adherence and plans-by-type charts for every client.",
  },
  {
    title: "Demo data",
    body: "Load 3 sample clients, or 10 clients with six months of history, to explore everything before adding your own.",
  },
];

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

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="landing-cream scroll-mt-16 py-16">
      <div className="mx-auto max-w-[1100px] px-4">
        <h2 id={`${id}-title`} className="text-3xl">
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
        <Section id="features" title="Features">
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <article key={f.title} className="landing-card p-5">
                <h3 className="text-xl">{f.title}</h3>
                <p className="landing-dim mt-2 text-sm">{f.body}</p>
              </article>
            ))}
          </div>
        </Section>
        <Section id="demo" title="Demo">
          <p className="landing-dim mt-3 max-w-2xl">
            Open the app and load the sample clients to try the AI Coach, the planner and the
            progress charts with realistic data.
          </p>
          <a href="/app" className="mt-4 inline-flex min-h-10 items-center font-semibold underline underline-offset-4">
            Try it in the app
          </a>
        </Section>
        <Section id="pricing" title="Pricing">
          <p className="landing-dim mt-3">Pricing is coming soon.</p>
        </Section>
        <Section id="faq" title="FAQ">
          <p className="landing-dim mt-3">Answers to common questions are coming soon.</p>
        </Section>
      </main>
      <footer className="landing-dark">
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
