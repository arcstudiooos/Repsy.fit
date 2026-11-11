import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { assignmentsRouter } from "./routes/assignments.js";
import { autoAssignRouter } from "./routes/autoAssign.js";
import { chatRouter } from "./routes/chat.js";
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
import { templatesRouter } from "./routes/templates.js";
import { mealsRouter } from "./routes/meals.js";
import { macrosRouter } from "./routes/macros.js";
import { leadsRouter } from "./routes/leads.js";
import { authRouter } from "./routes/auth.js";
import { sessionMiddleware } from "./auth/session.js";
import { requireCoach } from "./auth/requireCoach.js";
import { prisma } from "./db.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built client lives at client/dist (two levels up from server/dist or server/src).
const clientDist = path.resolve(__dirname, "../../client/dist");

// The Express app, without listening or connecting to the database,
// so tests can import it directly.
export const app = express();
// Render puts one proxy in front of the app: trust it so req.ip (rate limits) is the real caller.
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(sessionMiddleware);

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
app.use("/api/at-risk", requireCoach);
app.use("/api/templates", requireCoach);
app.use("/api/meals", requireCoach);
app.use("/api/macros", requireCoach);
app.use("/api/messages", requireCoach);

app.use("/api/macros", macrosRouter);
app.use("/api/messages", threadsRouter);
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
app.use("/api/clients/:clientId/checkins", dailyCheckInsRouter);
app.use("/api/clients/:clientId/habits", habitsRouter);
app.use("/api/clients/:clientId/measurements", measurementsRouter);
// Coach <-> client messages (Prompt 63). Separate from the AI Coach chat route above.
app.use("/api/clients/:clientId/messages", messagesRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/seed", seedRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/auth", authRouter);

// Unknown API routes return JSON 404 instead of the client page.
// "Not found" is reserved for missing routes (see API contract in CLAUDE.md).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Errors always come back as JSON { error } (API contract), never an HTML page.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err && typeof err === "object" && (err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body is not valid JSON." });
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
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}
