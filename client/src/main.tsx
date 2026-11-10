import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./api";
import { IN_APP_KEY, routeFor } from "./route";
import "./index.css";

// Routing (Prompt 37): "/" = public landing page, "/app" (and "/app/...") = the coach dashboard.
// Each side is its own lazy chunk, so the landing page's 3D / animation code never loads in /app.
const App = lazy(() => import("./App"));
const Landing = lazy(() => import("./landing/Landing"));

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
if (route === "landing") void import("./landing/Landing");
else if (route === "app") void import("./App");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>{route === "app" ? <App /> : route === "landing" ? <Landing /> : null}</Suspense>
    </QueryClientProvider>
  </StrictMode>,
);
