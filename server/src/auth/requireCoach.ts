// Route guard (Prompt 45): lets a request through only when sessionMiddleware found a valid session,
// otherwise 401 { error } before any route code or database query runs.
import type { NextFunction, Request, Response } from "express";

export function requireCoach(req: Request, res: Response, next: NextFunction): void {
  if (!req.coachId) {
    res.status(401).json({ error: "You are not signed in." });
    return;
  }
  next();
}

/** The signed-in coach's id. Only call from routes behind requireCoach. */
export function coachIdOf(req: Request): string {
  if (!req.coachId) throw new Error("coachIdOf called on a route without requireCoach");
  return req.coachId;
}
