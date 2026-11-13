import { Suspense, lazy, useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { ThemeSwitch } from "./components/ThemeSwitch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getMe, listClients, logout, queryKeys, seedDemo as seedQuickDemo, seedSixMonthDemo } from "./api";
import { ClientHeader, initials } from "./ClientHeader";
import { MenuButton } from "./components/MenuButton";
import { EmptyState, ErrorState, LoadingState, plainErrorMessage } from "./components/States";
import { navigate } from "./route";
import { AiCoachTab } from "./tabs/AiCoachTab";
import { ClientsTab } from "./tabs/ClientsTab";
import { HomeTab, useReviewQueueCount } from "./tabs/HomeTab";
import type { TemplatePrefill } from "./components/ManualAssignmentForm";
import { PlannerTab } from "./tabs/PlannerTab";
import { useDemoSeed } from "./lib/useDemoSeed";
import type { Client, Coach } from "./types";
import type { LibraryView } from "./tabs/LibraryTab";

// The account page (Prompt 47) is its own lazy chunk: its form validation (zod) stays out of the first /app load.
const AccountPage = lazy(() => import("./auth/AccountPage"));
// The Library (Prompt 58; a Business view since Nov 2026) loads on first open, which keeps the /app first load inside its size budget.
const LibraryTab = lazy(() => import("./tabs/LibraryTab").then((m) => ({ default: m.LibraryTab })));
// Progress and Check-ins draw charts, so Recharts loads with the tab the coach opens rather than
// with the whole dashboard. Home is the first screen and draws no charts, so nothing waits on it.
const ProgressTab = lazy(() => import("./tabs/ProgressTab").then((m) => ({ default: m.ProgressTab })));
const CheckInsTab = lazy(() => import("./tabs/CheckInsTab").then((m) => ({ default: m.CheckInsTab })));
// Coach <-> client messages (Prompt 63) - a separate conversation from the AI Coach tab.
const MessagesTab = lazy(() => import("./tabs/MessagesTab").then((m) => ({ default: m.MessagesTab })));
// Business (Prompt 68): plans and recorded payments, coach-level like Library (which is now a Business view).
const BusinessTab = lazy(() => import("./tabs/BusinessTab").then((m) => ({ default: m.BusinessTab })));
import type { BusinessView } from "./tabs/BusinessTab";
// Type-only: erased at build time, so the Messages code stays in its own lazy chunk.
import type { ChatState } from "./tabs/MessagesTab";
import { WaitingBanner } from "./components/WaitingBanner";

type TabId = "home" | "clients" | "ai" | "messages" | "business";
/** Sub-tabs of the client workspace (inside Clients). */
type SubTabId = "plans" | "progress" | "checkins";

// Five top-level sections (Nov 2026). Plans, Progress and Check-ins live in the client workspace
// inside Clients; Library lives in Business. Icons show on the phone bottom bar only.
const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", icon: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4v-9z" /> },
  { id: "clients", label: "Clients", icon: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14.5a7 7 0 0 1 4 6.5" /> },
  { id: "ai", label: "AI Coach", icon: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" /> },
  { id: "messages", label: "Messages", icon: <path d="M4 5h16v11H8l-4 4V5z" /> },
  { id: "business", label: "Business", icon: <path d="M3 8h18v12H3V8zm6 0V5h6v3M3 13h18" /> },
];

const SUB_TABS: { id: SubTabId; label: string }[] = [
  { id: "plans", label: "Plans" },
  { id: "progress", label: "Progress" },
  { id: "checkins", label: "Check-ins" },
];

/** Tab-pattern keys (APG): Left / Right move and activate, Home / End jump. Focus follows. */
function onTabKeys<T extends string>(e: KeyboardEvent<HTMLElement>, ids: T[], active: T, select: (id: T) => void, idPrefix: string) {
  const i = ids.indexOf(active);
  let next = -1;
  if (e.key === "ArrowRight") next = (i + 1) % ids.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + ids.length) % ids.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = ids.length - 1;
  if (next < 0) return;
  e.preventDefault();
  select(ids[next]);
  document.getElementById(`${idPrefix}${ids[next]}`)?.focus();
}

function Header({ coach, onLogout, loggingOut }: { coach: Coach; onLogout: () => void; loggingOut: boolean }) {
  return (
    <header className="header-strip bg-header">
      <div className="mx-auto flex max-w-[1100px] items-center gap-3 px-4 py-3">
        {/* The Repsy logo: gradient R mark + white wordmark, made for the dark header strip. */}
        <img src="/repsy-logo.png" alt="Repsy" width={130} height={36} className="h-9 w-auto shrink-0" />
        {/* Right side: the light / dark switch, then ONE account menu (Account settings, Log out). */}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <ThemeSwitch className="text-white" />
          <MenuButton
            label={`Account menu for ${coach.name ?? ""}`.trim()}
            buttonClassName="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-sm font-bold text-white hover:border-white"
            header={
              <span data-testid="coach-name" className="block max-w-56 truncate font-semibold text-text">
                {coach.name}
              </span>
            }
            items={[
              { label: "Account settings", onSelect: () => navigate("/app/account") },
              { label: loggingOut ? "Logging out..." : "Log out", onSelect: onLogout, disabled: loggingOut },
            ]}
          >
            <span aria-hidden="true">{initials(coach.name ?? "")}</span>
          </MenuButton>
        </div>
      </div>
    </header>
  );
}

// ONE tablist for every screen size. Desktop / tablet (sm+): horizontal, Chrome-style tabs above the
// panel; the panel's top border is drawn as a 1px line at the bottom of this row, so the active tab can
// cover it. Phones (<640px): the same tablist is a fixed bottom tab bar with icons (like the client app).
// Never a vertical / side menu.
function TabBar({ active, onSelect }: { active: TabId; onSelect: (id: TabId) => void }) {
  // Prompt 52: how many items wait in the review queue (this coach only). 0 shows no badge.
  const reviewCount = useReviewQueueCount();
  return (
    <div
      role="tablist"
      aria-label="Sections"
      onKeyDown={(e) => onTabKeys(e, TABS.map((t) => t.id), active, onSelect, "tab-")}
      className={
        "no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] " +
        "sm:static sm:z-auto sm:items-end sm:gap-1 sm:overflow-x-auto sm:border-t-0 sm:bg-transparent sm:pb-0 sm:pt-4 " +
        "sm:bg-[image:linear-gradient(var(--border),var(--border))] sm:bg-[length:100%_1px] sm:bg-bottom sm:bg-no-repeat"
      }
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
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            className={
              "relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold " +
              "sm:min-h-0 sm:flex-none sm:shrink-0 sm:flex-row sm:gap-0 sm:whitespace-nowrap sm:rounded-t-[10px] sm:border sm:border-b-0 sm:px-5 sm:py-2.5 sm:text-sm " +
              (isActive
                ? // Active: surface colour, covers the line below so it joins the panel.
                  "text-accent2 sm:border-border sm:bg-surface sm:text-text"
                : // Inactive: stops 1px above the line.
                  "text-dim sm:mb-px sm:border-transparent sm:bg-tab-inactive sm:hover:text-text")
            }
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sm:hidden">
              {tab.icon}
            </svg>
            <span className="max-w-full truncate">{tab.label}</span>
            {tab.id === "home" && reviewCount > 0 && (
              <span
                aria-label={`${reviewCount} waiting in the review queue`}
                className="absolute right-[calc(50%-1.5rem)] top-1 inline-block rounded-full bg-accent px-1.5 text-[10px] font-bold leading-4 text-on-accent sm:static sm:ml-2 sm:px-2 sm:py-0.5 sm:text-xs"
              >
                {reviewCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Plans / Progress / Check-ins for the selected client: a nested tablist inside the Clients panel. */
function SubTabBar({ active, onSelect, clientName }: { active: SubTabId; onSelect: (id: SubTabId) => void; clientName: string }) {
  return (
    <div
      role="tablist"
      aria-label={`Client workspace: ${clientName}`}
      onKeyDown={(e) => onTabKeys(e, SUB_TABS.map((t) => t.id), active, onSelect, "subtab-")}
      className="mb-5 flex gap-1 border-b border-border"
    >
      {SUB_TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`subtab-${t.id}`}
            aria-selected={isActive}
            aria-controls={`subpanel-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(t.id)}
            className={
              "-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold " +
              (isActive ? "border-accent text-text" : "border-transparent text-dim hover:text-text")
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
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
          <p role="alert" className="fixed bottom-20 left-1/2 z-30 sm:bottom-4 -translate-x-1/2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-amber-text">
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
  // /app opens on Home (owner, Nov 2026; it opened on AI Coach until then).
  const [activeTab, setActiveTab] = useState<TabId>("home");
  // Clients shows the roster, or one client's workspace (Plans / Progress / Check-ins).
  const [inWorkspace, setInWorkspace] = useState(false);
  const [subTab, setSubTab] = useState<SubTabId>("plans");
  // Business view (Payments / Schedule / Engagement / Reports / Library), lifted so links can open Library.
  const [businessView, setBusinessView] = useState<BusinessView>("Payments");
  // UI batch 4: the Library's own view (Templates / Meals / Macro calculator), remembered while the app is open.
  const [libraryView, setLibraryView] = useState<LibraryView>("Templates");
  // Prompt 58: a Library template waiting to fill the Plans new-assignment form.
  const [plannerPrefill, setPlannerPrefill] = useState<TemplatePrefill | null>(null);
  // Unsent chat messages and drafts live here, above the tabs, so leaving the Messages tab
  // mid-send never loses one (Prompt 64).
  const [chat, setChat] = useState<ChatState>({ pendingBy: {}, drafts: {} });
  const clearPlannerPrefill = useCallback(() => setPlannerPrefill(null), []);
  // Prompt 61: the client whose details should pre-fill the Library's macro calculator (used once).
  const [macroClientId, setMacroClientId] = useState<string | null>(null);
  const clearMacroClientId = useCallback(() => setMacroClientId(null), []);
  const openMacroCalculator = useCallback((clientId: string) => {
    setMacroClientId(clientId);
    setBusinessView("Library");
    setLibraryView("Macro calculator");
    setActiveTab("business");
  }, []);

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

  /** Top-level tab. Choosing Clients always shows the full roster. */
  const selectTab = useCallback((id: TabId) => {
    setActiveTab(id);
    if (id === "clients") setInWorkspace(false);
  }, []);
  /** Opens one client's workspace in Clients, on the given sub-tab. */
  const openWorkspace = useCallback((clientId: string | null, sub: SubTabId) => {
    if (clientId) setSelectedClientId(clientId);
    setSubTab(sub);
    setInWorkspace(true);
    setActiveTab("clients");
  }, []);

  // Both "Load demo" buttons share this; after a seed the first demo client is selected.
  const seedDemo = useDemoSeed(setSelectedClientId, { seed: seedQuickDemo, alreadyLoaded: "Demo already loaded" });
  const seedSixMonth = useDemoSeed(setSelectedClientId, {
    seed: seedSixMonthDemo,
    alreadyLoaded: "6-month demo already loaded",
  });

  // Loading / error / no-clients states for the views that need clients.
  let clientsGate: ReactNode = null;
  if (clientsQuery.isPending || (clientsQuery.isError && clientsQuery.isFetching)) {
    // Also while retrying after an error, so Retry gives visible feedback.
    clientsGate = <LoadingState />;
  } else if (clientsQuery.isError) {
    clientsGate = <ErrorState error={clientsQuery.error} onRetry={() => void clientsQuery.refetch()} />;
  } else if (clients.length === 0) {
    clientsGate = (
      <>
        <WaitingBanner onOpen={() => selectTab("clients")} />
        <EmptyState onAddClient={() => selectTab("clients")} seedDemo={seedDemo} />
      </>
    );
  }

  const clientHeader = selectedClient && (
    <ClientHeader clients={clients} client={selectedClient} onSelect={setSelectedClientId} />
  );

  let panelContent: ReactNode;
  if (activeTab === "clients" && inWorkspace && selectedClient) {
    // The client workspace. key forces a clean remount when the selected client changes, so no
    // view can keep showing the previous client's data.
    panelContent = (
      <>
        <p className="mb-3 text-sm">
          <button
            type="button"
            onClick={() => setInWorkspace(false)}
            className="min-h-10 font-semibold text-accent2 underline underline-offset-4"
          >
            ← Back to all clients
          </button>
        </p>
        {clientHeader}
        <SubTabBar active={subTab} onSelect={setSubTab} clientName={selectedClient.name} />
        <div role="tabpanel" id={`subpanel-${subTab}`} aria-labelledby={`subtab-${subTab}`}>
          {subTab === "plans" ? (
            <PlannerTab
              key={`planner:${selectedClient.id}`}
              client={selectedClient}
              onOpenAiCoach={() => selectTab("ai")}
              prefill={plannerPrefill}
              onPrefillUsed={clearPlannerPrefill}
              onOpenMacroCalculator={openMacroCalculator}
            />
          ) : subTab === "progress" ? (
            <Suspense fallback={<LoadingState />}>
              <ProgressTab key={`progress:${selectedClient.id}`} client={selectedClient} />
            </Suspense>
          ) : (
            <Suspense fallback={<LoadingState />}>
              <CheckInsTab key={`checkins:${selectedClient.id}`} client={selectedClient} />
            </Suspense>
          )}
        </div>
      </>
    );
  } else if (activeTab === "clients") {
    // The roster handles its own loading / error / empty states.
    panelContent = (
      <ClientsTab
        selectedClientId={selectedClientId}
        onOpenClient={(clientId) => openWorkspace(clientId, "plans")}
        onClientCreated={setSelectedClientId}
        onClientDeleted={(deletedId, nextClientId) => {
          // If the deleted client was selected, select the next remaining one (or none).
          setSelectedClientId((current) => (current === deletedId ? nextClientId : current));
        }}
        seedDemo={seedDemo}
        seedSixMonth={seedSixMonth}
      />
    );
  } else if (activeTab === "business") {
    // Library (templates, meals, macro calculator) belongs to the coach, so it works with zero
    // clients; the other Business views need clients and show the usual states instead.
    panelContent = (
      <Suspense fallback={<LoadingState />}>
        <BusinessTab
          clients={clients}
          view={businessView}
          onViewChange={setBusinessView}
          blocked={clientsGate}
          library={
            <LibraryTab
              view={libraryView}
              onViewChange={setLibraryView}
              onAssign={(clientId, prefill) => {
                setPlannerPrefill(prefill);
                openWorkspace(clientId, "plans");
              }}
              macroClientId={macroClientId}
              onMacroPrefillUsed={clearMacroClientId}
            />
          }
        />
      </Suspense>
    );
  } else if (clientsGate) {
    panelContent = clientsGate;
  } else if (activeTab === "home") {
    panelContent = (
      <HomeTab
        onOpenTask={(clientId, target) => {
          if (target === "planner") openWorkspace(clientId, "plans");
          else {
            setSelectedClientId(clientId);
            selectTab("ai");
          }
        }}
        onOpenClient={(clientId, sub) => openWorkspace(clientId, sub)}
        onOpenThread={(clientId) => {
          setSelectedClientId(clientId);
          selectTab("messages");
        }}
        onOpenClients={() => selectTab("clients")}
      />
    );
  } else if (activeTab === "ai") {
    panelContent = (
      <>
        {clientHeader}
        <AiCoachTab
          key={`ai:${selectedClientId ?? "none"}`}
          client={selectedClient}
          onOpenPlanner={() => openWorkspace(selectedClientId, "plans")}
        />
      </>
    );
  } else {
    // Messages has its own client column (with previews and unread dots) instead of the client header.
    panelContent = (
      <Suspense fallback={<LoadingState />}>
        <MessagesTab
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={setSelectedClientId}
          chat={chat}
          setChat={setChat}
        />
      </Suspense>
    );
  }

  return (
    // Phones: room at the bottom for the fixed tab bar (and the safe area).
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0">
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
            <TabBar active={activeTab} onSelect={selectTab} />
            <section
              role="tabpanel"
              id={`panel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
              className="card mt-4 p-4 sm:mt-0 sm:rounded-t-none sm:border-t-0 sm:p-6"
            >
              {/* The demo buttons vanish once there are clients, so their result is said here. */}
              {(seedDemo.message ?? seedSixMonth.message) && (
                <p role="status" className="mb-3 text-sm font-semibold text-accent2">
                  {seedDemo.message ?? seedSixMonth.message}
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
