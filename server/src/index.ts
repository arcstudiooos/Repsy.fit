import { app } from "./app.js";
import { connectDb, disconnectDb } from "./db.js";
import { pruneOldLeads } from "./routes/leads.js";
import { alertOwner } from "./ops/alerts.js";
import { budgetWarning } from "./ai/budget.js";

const port = Number(process.env.PORT) || 3001;
await connectDb();
const server = app.listen(port, () => {
  console.log(`Repsy Coach server listening on port ${port}`);
});

// Nov 2026: the failures that never reach Express. An unhandled rejection in a background timer, or
// a throw outside a request, previously vanished into the host's log where nobody was looking.
//
// We ALERT but do not exit: Express handlers are wrapped in asyncHandler, so a stray rejection is
// usually a background job, and killing a server that is still serving coaches would be the worse
// outcome. An uncaught exception is different - the process state is no longer trustworthy, so we
// alert and let the host restart us.
process.on("unhandledRejection", (reason: unknown) => {
  const detail = reason instanceof Error ? `${reason.name}: ${reason.message}\n${reason.stack ?? ""}` : String(reason);
  console.error("Unhandled promise rejection:", detail);
  alertOwner("an unhandled error in the background", detail);
});
process.on("uncaughtException", (err: Error) => {
  console.error("Uncaught exception:", err);
  alertOwner("the server hit an uncaught error and is restarting", `${err.name}: ${err.message}\n${err.stack ?? ""}`);
  // Give the alert a moment to leave before the host restarts us.
  setTimeout(() => process.exit(1), 2_000).unref();
});

// Tells the owner once when the AI budget is most of the way gone, so it is never a surprise.
function checkAiBudget() {
  budgetWarning()
    .then((message) => {
      if (message) alertOwner("the AI budget is nearly used up", message);
    })
    .catch((err: unknown) => console.error("AI budget check failed:", err instanceof Error ? err.message : err));
}
checkAiBudget();
setInterval(checkAiBudget, 6 * 60 * 60 * 1000).unref();

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
