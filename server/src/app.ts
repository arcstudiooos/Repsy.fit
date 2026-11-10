import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { assignmentsRouter } from "./routes/assignments.js";
import { autoAssignRouter } from "./routes/autoAssign.js";
import { chatRouter } from "./routes/chat.js";
import { clientsRouter } from "./routes/clients.js";
import { progressRouter } from "./routes/progress.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built client lives at client/dist (two levels up from server/dist or server/src).
const clientDist = path.resolve(__dirname, "../../client/dist");

// The Express app, without listening or connecting to the database,
// so tests can import it directly.
export const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/clients/:clientId/assignments", assignmentsRouter);
app.use("/api/clients/:clientId/auto-assign", autoAssignRouter);
app.use("/api/clients/:clientId/chat", chatRouter);
app.use("/api/clients/:clientId/progress", progressRouter);
app.use("/api/clients", clientsRouter);

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
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}
