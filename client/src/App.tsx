import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listClients, queryKeys } from "./api";
import type { Client } from "./types";

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

// Every tab receives the selected client. All data views are per selected client -
// never mixed data from two clients.
type TabProps = { tab: { id: TabId; label: string }; client: Client | null };

function PlaceholderTab({ tab, client }: TabProps) {
  return (
    <>
      <h2 className="text-2xl">{tab.label}</h2>
      <p className="mt-2 text-dim">Placeholder - {tab.label} content comes in a later prompt.</p>
      <p className="mt-1 text-sm text-dim">Selected client: {client ? client.name : "none"}</p>
    </>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const current = TABS.find((t) => t.id === activeTab)!;

  // Shared "selected client" for the whole app.
  const clientsQuery = useQuery({ queryKey: queryKeys.clients, queryFn: listClients });
  const clients = clientsQuery.data ?? [];
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Default to the first client when the list loads, and fall back to the first client
  // if the selected one disappears (e.g. deleted).
  useEffect(() => {
    if (!clientsQuery.data) return;
    const stillExists = clientsQuery.data.some((c) => c.id === selectedClientId);
    if (!stillExists) setSelectedClientId(clientsQuery.data[0]?.id ?? null);
  }, [clientsQuery.data, selectedClientId]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

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
          {/* key forces a clean remount when the selected client changes, so no tab can
              keep showing the previous client's data. */}
          <PlaceholderTab key={`${current.id}:${selectedClientId ?? "none"}`} tab={current} client={selectedClient} />
        </section>
      </main>
    </div>
  );
}
