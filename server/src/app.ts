import express from "express";
import cors from "cors";
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
