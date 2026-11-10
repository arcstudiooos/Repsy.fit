import { useState } from "react";

type TabId = "ai" | "clients" | "planner" | "progress";

const TABS: { id: TabId; label: string }[] = [
  { id: "ai", label: "AI Coach" },
  { id: "clients", label: "Clients" },
  { id: "planner", label: "Manual Planner" },
  { id: "progress", label: "Progress" },
];

function Header() {
  return (
    <header className="bg-header">
      <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent font-heading text-xl font-bold text-on-accent"
        >
          R
        </div>
        <div className="leading-tight">
          <div className="font-heading text-2xl font-bold uppercase tracking-wide text-white">Repsy</div>
          <div className="text-xs text-white/70">Prototype - coach command center</div>
        </div>
      </div>
    </header>
  );
}

// Horizontal, Chrome-style tabs. Never a vertical / side menu at any screen size:
// on narrow screens the row scrolls sideways instead of wrapping.
// The panel's top border is drawn as a 1px line at the bottom of this row (not on the
// panel), so the active tab can cover it without being clipped by the scroll container.
function TabBar({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Sections"
      className="flex flex-nowrap items-end gap-1 overflow-x-auto pt-4 [scrollbar-width:thin]"
      style={{
        backgroundImage: "linear-gradient(var(--border), var(--border))",
        backgroundSize: "100% 1px",
        backgroundPosition: "bottom",
        backgroundRepeat: "no-repeat",
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            className={
              "relative shrink-0 whitespace-nowrap rounded-t-[10px] border border-b-0 px-5 py-2.5 text-sm font-semibold " +
              (isActive
                ? // Active: surface colour, covers the line below so it joins the panel.
                  "border-border bg-surface text-text"
                : // Inactive: stops 1px above the line.
                  "mb-px border-transparent bg-tab-inactive text-dim hover:text-text")
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const current = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1100px] px-4 pb-10">
        <TabBar active={activeTab} onSelect={setActiveTab} />
        <section
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
          className="card rounded-t-none border-t-0 p-6"
        >
          <h2 className="text-2xl">{current.label}</h2>
          <p className="mt-2 text-dim">Placeholder - {current.label} content comes in a later prompt.</p>
        </section>
      </main>
    </div>
  );
}
