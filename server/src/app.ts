import express, { type NextFunction, type Request, type Response } from "express";
import { assignmentsRouter } from "./routes/assignments.js";
import { autoAssignRouter } from "./routes/autoAssign.js";
import { chatRouter } from "./routes/chat.js";
import { inboundMailRouter } from "./routes/inboundMail.js";
import { clientsRouter } from "./routes/clients.js";
import { progressRouter } from "./routes/progress.js";
import { seedRouter } from "./routes/seed.js";
import { tasksRouter } from "./routes/tasks.js";
import { checkinsRouter } from "./routes/checkins.js";
import { atRiskRouter } from "./routes/atRisk.js";
import { weeklySummaryRouter } from "./routes/weeklySummary.js";
import { reviewQueueRouter } from "./routes/reviewQueue.js";
import { dailyCheckInsRouter } from "./routes/dailyCheckIns.js";
import { habitsRouter } from "./routes/habits.js";
import { measurementsRouter } from "./routes/measurements.js";
import { messagesRouter, threadsRouter } from "./routes/messages.js";
import { alertsRouter } from "./routes/alerts.js";
import { clientAuthRouter } from "./routes/clientAuth.js";
import { clientJoinRouter } from "./routes/clientJoin.js";
import { clientGoogleRouter } from "./routes/clientGoogle.js";
import { clientAppRouter } from "./routes/clientApp.js";
import { clientTrackingRouter } from "./routes/clientTracking.js";
import { clientMessagesRouter } from "./routes/clientMessages.js";
import { clientAccountRouter } from "./routes/clientAccount.js";
import { clientInviteRouter } from "./routes/clientInvite.js";
import { businessRouter, clientPlanRouter } from "./routes/business.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { reportsRouter } from "./routes/reports.js";
import { clientSessionMiddleware } from "./auth/clientSession.js";
import { templatesRouter } from "./routes/templates.js";
import { mealsRouter } from "./routes/meals.js";
import { macrosRouter } from "./routes/macros.js";
import { leadsRouter } from "./routes/leads.js";
import { authRouter } from "./routes/auth.js";
import { joinCodeRouter, publicJoinRouter } from "./routes/joinCode.js";
import { sessionMiddleware } from "./auth/session.js";
import { requireCoach } from "./auth/requireCoach.js";
import { prisma } from "./db.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built client lives at client/dist (two levels up from server/dist or server/src).
const clientDist = path.resolve(__dirname, "../../client/dist");

// The Express app, without listening or connecting to the database,
// so tests can import it directly.
export const app = express();
// Render puts one proxy in front of the app: trust it so req.ip (rate limits) is the real caller.
app.set("trust proxy", 1);
app.disable("x-powered-by");
// Security headers on every response (Prompt 73). No CORS middleware: the built client is served by
// this same app from this same origin (see the static handler below) and calls the API with relative
// paths, and the Vite dev server proxies /api, so nothing legitimate is ever cross-origin. A wildcard
// Access-Control-Allow-Origin on a cookie-authenticated app was the wrong default.
app.use(securityHeaders);
// Resend's inbound webhook is signed over the exact bytes it sent, so this route keeps the raw body
// (mounted before express.json, which would re-serialise it and break the signature).
app.use("/api/inbound/resend", express.raw({ type: "*/*", limit: "1mb" }));
app.use("/api/inbound", inboundMailRouter);
// 32 KB is far above anything the app sends (the longest field is 6,000 characters) and far below
// what an attacker needs to make a validator chew through memory - see the zod advisory note in
// CLAUDE.md. Oversized bodies get a 413 before any parsing or validation happens.
app.use(express.json({ limit: "32kb" }));
app.use(sessionMiddleware);
// Client sessions (Prompt 65): reads only the client cookie, sets only req.clientAccountId.
app.use(clientSessionMiddleware);

// Health check for Render and the coach: also checks the database answers (within 3 s).
// 503 when it doesn't, so Render never switches traffic to an instance without a database.
app.get("/api/health", async (_req, res) => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("database health check timed out")), 3_000);
  });
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    res.json({ ok: true, db: true });
  } catch (err) {
    console.error("Health check: database unavailable.", err instanceof Error ? err.message : err);
    res.status(503).json({ ok: false, db: false });
  } finally {
    clearTimeout(timer);
  }
});

// Every v1 data route needs a signed-in coach (Prompt 45). Public: /api/health, /api/leads, /api/auth/*.
app.use("/api/clients", requireCoach);
app.use("/api/seed", requireCoach);
app.use("/api/tasks", requireCoach);
app.use("/api/checkins", requireCoach);
app.use("/api/weekly-summary", requireCoach);
app.use("/api/review-queue", requireCoach);
app.use("/api/alerts", requireCoach);
app.use("/api/at-risk", requireCoach);
app.use("/api/templates", requireCoach);
app.use("/api/meals", requireCoach);
app.use("/api/macros", requireCoach);
app.use("/api/messages", requireCoach);
app.use("/api/business", requireCoach);
app.use("/api/appointments", requireCoach);
app.use("/api/reports", requireCoach);
app.use("/api/join-code", requireCoach);

app.use("/api/reports", reportsRouter);
// Prompt 76: the coach's join code (coach-only) and its public lookup (signed-out clients).
app.use("/api/join-code", joinCodeRouter);
app.use("/api/join", publicJoinRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/macros", macrosRouter);
app.use("/api/messages", threadsRouter);
app.use("/api/business", businessRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/at-risk", atRiskRouter);
app.use("/api/checkins", checkinsRouter);
app.use("/api/weekly-summary", weeklySummaryRouter);
app.use("/api/review-queue", reviewQueueRouter);
app.use("/api/clients/:clientId/assignments", assignmentsRouter);
app.use("/api/clients/:clientId/auto-assign", autoAssignRouter);
app.use("/api/clients/:clientId/chat", chatRouter);
app.use("/api/clients/:clientId/progress", progressRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/clients/:clientId/checkins", dailyCheckInsRouter);
app.use("/api/clients/:clientId/habits", habitsRouter);
app.use("/api/clients/:clientId/measurements", measurementsRouter);
// Coach <-> client messages (Prompt 63). Separate from the AI Coach chat route above.
app.use("/api/clients/:clientId/messages", messagesRouter);
app.use("/api/clients/:clientId/invite", clientInviteRouter);
app.use("/api/clients/:clientId/plan", clientPlanRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/seed", seedRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/auth", authRouter);
// Client sign-in (Prompt 65): separate from coach auth above.
app.use("/api/client-auth", clientAuthRouter);
// Prompt 77: joining with a code, the welcome questions, and client password reset.
app.use("/api/client-auth", clientJoinRouter);
// Prompt 78: Continue with Google for clients (the callback is shared: routes/googleAuth.ts).
app.use("/api/client-auth", clientGoogleRouter);
// Prompt 79: the client app - the client's own plans, and marking them done.
app.use("/api/client-auth", clientAppRouter);
// Prompt 80: the client's habits, daily / weekly check-ins, targets.
app.use("/api/client-auth", clientTrackingRouter);
app.use("/api/client-auth", clientMessagesRouter);
app.use("/api/client-auth", clientAccountRouter);

// Unknown API routes return JSON 404 instead of the client page.
// "Not found" is reserved for missing routes (see API contract in CLAUDE.md).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Errors always come back as JSON { error } (API contract), never an HTML page.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const type = err && typeof err === "object" ? (err as { type?: string }).type : undefined;
  if (type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body is not valid JSON." });
    return;
  }
  // Over the 32 KB cap: a plain 413, not a 500 (nothing went wrong on our side).
  if (type === "entity.too.large") {
    res.status(413).json({ error: "That request is too large." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

// Production: serve the built client. In dev, Vite serves it instead.
if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      // Hashed build files never change: let browsers cache them for a year.
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  // Privacy and Terms are sent as prerendered HTML (client/scripts/prerender-legal.mjs), so crawlers
  // such as Google's OAuth branding review read the full text without running JavaScript.
  for (const page of ["privacy", "terms"]) {
    const file = path.join(clientDist, "legal", `${page}.html`);
    app.get(`/${page}`, (_req, res, next) => (fs.existsSync(file) ? res.sendFile(file) : next()));
  }
  // /pricing is the landing page with its own title, description and canonical (prerender-seo.mjs).
  const pricingFile = path.join(clientDist, "pricing.html");
  app.get("/pricing", (_req, res, next) => (fs.existsSync(pricingFile) ? res.sendFile(pricingFile) : next()));

  const TOKEN_PAGES = new Set(["/client/set-password", "/reset-password", "/client/reset-password"]);
  // Paths the app actually has. Anything else is a real 404, not the landing page with a 200:
  // a "soft 404" teaches search engines that every typo is a valid page.
  const KNOWN_PAGES = new Set([
    "/",
    "/pricing",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/privacy",
    "/terms",
    "/client",
    "/client/login",
    "/client/set-password",
    "/client/welcome",
    "/client/forgot-password",
    "/client/reset-password",
    "/client/week",
    "/client/progress",
    "/client/messages",
    "/client/me",
    "/client/checkin",
    "/client/weekly",
  ]);
  const KNOWN_PREFIXES = ["/app", "/client/plan/", "/join/"];
  const notFoundFile = path.join(clientDist, "not-found.html");
  app.get("*", (req, res) => {
    const p = req.path.length > 1 ? req.path.replace(/\/+$/, "") : req.path;
    const known = KNOWN_PAGES.has(p) || KNOWN_PREFIXES.some((pre) => p === pre || p.startsWith(pre));
    if (!known && fs.existsSync(notFoundFile)) {
      res.status(404).sendFile(notFoundFile);
      return;
    }
    // Pages whose URL carries a one-time token (invite, password reset) never send it on as a Referer.
    if (TOKEN_PAGES.has(req.path)) res.setHeader("Referrer-Policy", "no-referrer");
    res.sendFile(path.join(clientDist, "index.html"));
  });
}
