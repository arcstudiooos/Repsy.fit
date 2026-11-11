// Password-reset tokens (Prompt 47): 256 random bits sent in the emailed link; only the SHA-256 hash
// is stored, so a database leak can't be used to reset anyone's password. A token lives 1 hour and
// is single-use (see the reset route, which spends it atomically).
import crypto from "node:crypto";
import type { prisma, Tx } from "../db.js";

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** The shared client or a transaction: both work. */
type Db = Pick<Tx, "passwordResetToken"> | Pick<typeof prisma, "passwordResetToken">;

/**
 * Creates a reset token for the coach and returns the raw value (the only copy that ever exists).
 * Older unused tokens of that coach are removed, so only the newest link works. `now` is for tests.
 */
export async function issueResetToken(db: Db, coachId: string, now = Date.now()): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.passwordResetToken.deleteMany({ where: { coachId, usedAt: null } });
  await db.passwordResetToken.create({
    data: { coachId, tokenHash: hashToken(token), expiresAt: new Date(now + RESET_TOKEN_TTL_MS) },
  });
  return token;
}

/** Link base for emails: APP_URL, else Render's own URL, else the local Vite dev server. Null in production with neither. */
export function appBaseUrl(): string | null {
  const fromEnv = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? null : "http://localhost:5173";
}

export function resetLink(base: string, token: string): string {
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}
