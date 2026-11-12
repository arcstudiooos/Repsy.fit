import { app } from "./app.js";
import { connectDb, disconnectDb } from "./db.js";
import { pruneOldLeads } from "./routes/leads.js";

const port = Number(process.env.PORT) || 3001;
await connectDb();
const server = app.listen(port, () => {
  console.log(`Repsy Coach server listening on port ${port}`);
});

// Website enquiries are kept for at most 12 months (Privacy Policy): prune now and once a day.
function pruneLeads() {
  pruneOldLeads().catch((err) => console.error("Pruning old enquiries failed:", err instanceof Error ? err.message : err));
}
pruneLeads();
setInterval(pruneLeads, 24 * 60 * 60 * 1000).unref();

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
