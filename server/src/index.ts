import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDb, disconnectDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Built client lives at client/dist (two levels up from server/dist or server/src).
const clientDist = path.resolve(__dirname, "../../client/dist");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Unknown API routes return JSON 404 instead of the client page.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Production: serve the built client. In dev, Vite serves it instead.
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const port = Number(process.env.PORT) || 3001;
await connectDb();
const server = app.listen(port, () => {
  console.log(`Repsy Coach server listening on port ${port}`);
});

// Clean shutdown: Render sends SIGTERM on restart/redeploy; Ctrl+C sends SIGINT.
// Stop accepting requests, let in-flight ones finish, then close the DB connection.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  // Force exit if open connections keep the server from closing in time.
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
