import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getMe, listClients, logout, queryKeys, seedDemo as seedQuickDemo, seedSixMonthDemo } from "./api";
import { ClientStrip } from "./ClientStrip";
import { EmptyState, ErrorState, LoadingState, plainErrorMessage } from "./components/States";
import { navigate } from "./route";
import { AiCoachTab } from "./tabs/AiCoachTab";
import { ClientsTab } from "./tabs/ClientsTab";
import { PlannerTab } from "./tabs/PlannerTab";
import { ProgressTab } from "./tabs/ProgressTab";
import { useDemoSeed } from "./lib/useDemoSeed";
import type { Client, Coach } from "./types";

// The account page (Prompt 47) is its own lazy chunk: its form validation (zod) stays out of the first /app load.
const AccountPage = lazy(() => import("./auth/AccountPage"));

type TabId = "ai" | "clients" | "planner" | "progress";

const TABS: { id: TabId; label: string }[] = [
  { id: "ai", label: "AI Coach" },
  { id: "clients", label: "Clients" },
  { id: "planner", label: "Manual Planner" },
  { id: "progress", label: "Progress" },
];

function Header({ coach, onLogout, loggingOut }: { coach: Coach; onLogout: () => void; loggingOut: boolean }) {
  return (
    <header className="header-strip bg-header">
      <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3">
        {/* The Repsy logo: gradient R mark + white wordmark, made for the dark header strip. */}
        <img src="/repsy-logo.png" alt="Repsy" width={113} height={36} className="h-9 w-auto shrink-0" />
        <div className="leading-tight">
          <div className="text-xs text-white/70">Prototype - coach command center</div>
        </div>
        {/* Right side (Prompt 46): the signed-in coach and Logout. */}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {/* The name opens the account page (Prompt 47): no extra button, so the header still fits at 375px. */}
          <a
            href="/app/account"
            title="Account"
            aria-label={`Account: ${coach.name}`}
            data-testid="coach-name"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigate("/app/account");
            }}
            className="inline-flex min-h-10 min-w-0 items-center text-sm text-white/70 underline decoration-white/30 underline-offset-4 hover:text-white"
          >
            <span className="truncate">{coach.name}</span>
          </a>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className="shrink-0 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold text-white hover:border-white disabled:opacity-60"
          >
            Log out
          </button>
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
      <p className="mt-1 text-sm text-dim">Selected: {client ? client.name : "none"}</p>
    </>
  );
}

// App guard (Prompt 46): nothing of the dashboard (and none of its queries) mounts until
// /api/auth/me has answered. Signed out goes to /login; any other failure can be retried.
export default function App() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: queryKeys.me, queryFn: getMe, retry: false, staleTime: Infinity });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const signedOut = meQuery.error instanceof ApiError && meQuery.error.status === 401;
  useEffect(() => {
    if (signedOut) navigate("/login", { replace: true });
  }, [signedOut]);

  async function onLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
    } catch (err) {
      setLogoutError(plainErrorMessage(err));
      setLoggingOut(false);
      return;
    }
    // Leave the dashboard first, then drop every cached answer so the next coach on this
    // browser can't see anything of this one.
    navigate("/login", { replace: true });
    queryClient.clear();
  }

  if (meQuery.data) {
    return (
      <>
        <Dashboard coach={meQuery.data} onLogout={onLogout} loggingOut={loggingOut} />
        {logoutError && (
          <p role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-amber-text">
            {logoutError}
          </p>
        )}
      </>
    );
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-[1100px] items-center justify-center px-4">
      <div className="w-full max-w-md">
        {meQuery.isError && !signedOut ? (
          <ErrorState error={meQuery.error} onRetry={() => void meQuery.refetch()} />
        ) : (
          <LoadingState />
        )}
      </div>
    </main>
  );
}

/** The current path, kept in step with in-page navigation (main.tsx's "popstate" convention). */
function usePathname(): string {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const onNav = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);
  return pathname;
}

function Dashboard({ coach, onLogout, loggingOut }: { coach: Coach; onLogout: () => void; loggingOut: boolean }) {
  const onAccount = usePathname() === "/app/account";
  const [activeTab, setActiveTab] = useState<TabId>("ai");
  const current = TABS.find((t) => t.id === activeTab)!;

  // Shared "selected client" for the whole app.
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients,
    queryFn: listClients,
  });
  const loadedClients: Client[] | undefined = clientsQuery.data;
  const clients = loadedClients ?? [];
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Default to the first client when the list loads, and fall back to the first client
  // if the selected one disappears (e.g. deleted).
  useEffect(() => {
    if (!loadedClients) return;
    const stillExists = loadedClients.some((c) => c.id === selectedClientId);
    if (!stillExists) setSelectedClientId(loadedClients[0]?.id ?? null);
  }, [loadedClients, selectedClientId]);

  const selectedClient = clients.find((c) => c.id === selectedClientId) ?? null;

  // Both "Load demo" buttons share this; after a seed the first demo client is selected.
  const seedDemo = useDemoSeed(setSelectedClientId, { seed: seedQuickDemo, alreadyLoaded: "Demo already loaded" });
  const seedSixMonth = useDemoSeed(setSelectedClientId, {
    seed: seedSixMonthDemo,
    alreadyLoaded: "6-month demo already loaded",
  });

  // What the panel shows. The Clients tab handles its own loading / error / empty states.
  // Other tabs: loading / error / empty states, or the strip + tab content.
  let panelContent: ReactNode;
  if (current.id === "clients") {
    panelContent = (
      <ClientsTab
        selectedClientId={selectedClientId}
        onOpenClient={(clientId) => {
          setSelectedClientId(clientId);
          setActiveTab("ai");
        }}
        onClientCreated={setSelectedClientId}
        onClientDeleted={(deletedId, nextClientId) => {
          // If the deleted client was selected, select the next remaining one (or none).
          setSelectedClientId((current) => (current === deletedId ? nextClientId : current));
        }}
        seedDemo={seedDemo}
        seedSixMonth={seedSixMonth}
      />
    );
  } else if (clientsQuery.isPending || (clientsQuery.isError && clientsQuery.isFetching)) {
    // Also while retrying after an error, so Retry gives visible feedback.
    panelContent = <LoadingState />;
  } else if (clientsQuery.isError) {
    panelContent = <ErrorState error={clientsQuery.error} onRetry={() => void clientsQuery.refetch()} />;
  } else if (clients.length === 0) {
    panelContent = <EmptyState onAddClient={() => setActiveTab("clients")} seedDemo={seedDemo} />;
  } else {
    panelContent = (
      <>
        {/* Client selector strip: every tab except Clients (that tab is the full list). */}
        <ClientStrip clients={clients} selectedClientId={selectedClientId} onSelect={setSelectedClientId} />
        {/* key forces a clean remount when the selected client changes, so no tab can
            keep showing the previous client's data. */}
        {current.id === "ai" ? (
          <AiCoachTab
            key={`ai:${selectedClientId ?? "none"}`}
            client={selectedClient}
            onOpenPlanner={() => setActiveTab("planner")}
          />
        ) : current.id === "planner" ? (
          <PlannerTab
            key={`planner:${selectedClientId ?? "none"}`}
            client={selectedClient}
            onOpenAiCoach={() => setActiveTab("ai")}
          />
        ) : current.id === "progress" ? (
          <ProgressTab key={`progress:${selectedClientId ?? "none"}`} client={selectedClient} />
        ) : (
          <PlaceholderTab key={`${current.id}:${selectedClientId ?? "none"}`} tab={current} client={selectedClient} />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen">
      <Header coach={coach} onLogout={onLogout} loggingOut={loggingOut} />
      <main className="mx-auto max-w-[1100px] px-4 pb-10">
        {onAccount ? (
          <section className="card mt-4 p-6" aria-label="Account">
            <p className="mb-4 text-sm">
              <a
                href="/app"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/app");
                }}
                className="font-semibold text-accent2 underline underline-offset-4"
              >
                Back to dashboard
              </a>
            </p>
            <Suspense fallback={<LoadingState />}>
              <AccountPage coach={coach} />
            </Suspense>
          </section>
        ) : (
          <>
        <TabBar active={activeTab} onSelect={setActiveTab} />
        <section
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
          className="card rounded-t-none border-t-0 p-6"
        >
          {seedDemo.message && (
            <p role="status" className="mb-3 text-sm font-semibold text-accent2">
              {seedDemo.message}
            </p>
          )}
          {panelContent}
        </section>
          </>
        )}
      </main>
      <footer className="mx-auto max-w-[1100px] px-4 pb-6 text-center text-xs text-dim">Repsy Coach - v1</footer>
    </div>
  );
}
