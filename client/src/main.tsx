import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./api";
import { IN_APP_KEY, routeFor, type Route } from "./route";
import "./index.css";

// Routing (Prompt 37): "/" = public landing page, "/app" (and "/app/...") = the coach dashboard.
// Each side is its own lazy chunk, so the landing page's 3D / animation code never loads in /app.
const App = lazy(() => import("./App"));
const Landing = lazy(() => import("./landing/Landing"));
// The "Studio" landing (Nov 2026), previewed at /?design=studio. Its own lazy chunk.
const StudioLanding = lazy(() => import("./landing-new/StudioLanding"));
const studio = new URLSearchParams(window.location.search).get("design") === "studio";
// Privacy / Terms (Prompt 73): drafts for legal review, their own lazy chunk.
const PrivacyPage = lazy(() => import("./legal/LegalPages").then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import("./legal/LegalPages").then((m) => ({ default: m.TermsPage })));
// Login / register screens (Prompt 46): own lazy chunk, so zod and the forms stay out of the first load.
const AuthPages = lazy(() => import("./auth/AuthPages"));
// Forgot / reset password screens (Prompt 47).
const PasswordPages = lazy(() => import("./auth/PasswordPages"));
// Client sign-in pages (Prompt 65): their own lazy chunk, apart from the coach screens.
const ClientPages = lazy(() => import("./auth/ClientPages"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry errors that won't fix themselves (missing endpoint, 4xx).
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status !== null && error.status < 500) && failureCount < 3,
    },
  },
});

const route = routeFor(window.location.pathname, {
  inAppFlow: sessionStorage.getItem(IN_APP_KEY) === "1",
  backForward:
    (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "back_forward",
});
if (route === "redirect-to-app") window.location.replace("/app");
if (route === "app") sessionStorage.setItem(IN_APP_KEY, "1");
// Start fetching the chunk for this route right away, in parallel with React starting up.
if (route === "landing") {
  void (studio ? import("./landing-new/StudioLanding") : import("./landing/Landing"));
  // Landing-only fonts: Caveat pen notes, and Barlow Condensed for the classic 3D hero. /app
  // never requests them.
  const fonts = document.createElement("link");
  fonts.rel = "stylesheet";
  fonts.href =
    "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Barlow+Condensed:wght@700&display=swap";
  fonts.dataset.landingFonts = "";
  document.head.appendChild(fonts);
}
else if (route === "app") void import("./App");
else if (route === "login" || route === "register") void import("./auth/AuthPages");
else if (route === "forgot" || route === "reset") void import("./auth/PasswordPages");
else if (route.startsWith("client-")) void import("./auth/ClientPages");
else if (route === "privacy" || route === "terms") void import("./legal/LegalPages");

// In-page navigation (guard redirect, login -> app, logout -> login) fires "popstate"; a history
// step is treated like Back/Forward so "/" still shows the landing page.
function Root() {
  const [current, setCurrent] = useState<Route>(route);
  useEffect(() => {
    const onNav = () => {
      const next = routeFor(window.location.pathname, { inAppFlow: true, backForward: true });
      if (next === "app") sessionStorage.setItem(IN_APP_KEY, "1");
      setCurrent(next);
    };
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);
  return (
    <Suspense fallback={null}>
      {current === "app" ? (
        <App />
      ) : current === "landing" ? (
        studio ? <StudioLanding /> : <Landing />
      ) : current === "login" || current === "register" ? (
        <AuthPages mode={current} />
      ) : current === "forgot" || current === "reset" ? (
        <PasswordPages mode={current} />
      ) : current === "client-login" || current === "client-set-password" || current === "client-home" ? (
        <ClientPages mode={current} />
      ) : current === "privacy" ? (
        <PrivacyPage />
      ) : current === "terms" ? (
        <TermsPage />
      ) : null}
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </StrictMode>,
);
