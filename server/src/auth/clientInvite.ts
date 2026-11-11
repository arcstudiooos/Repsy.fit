// Client invites (Prompt 65): 256 random bits in the set-password link; only the SHA-256 hash is
// stored. Single-use, 48 hours. Issuing a new invite for a client removes that client's older unused
// ones, so only the newest link works - under a row lock on the client, so two invites sent at the
// same moment cannot both survive. The invite carries the email it was sent to; that address
// becomes the client's login only when they set a password from this link.
import crypto from "node:crypto";
import type { Tx } from "../db.js";
import { hashToken } from "./resetToken.js";

export const INVITE_TTL_HOURS = 48;
export const INVITE_TTL_MS = INVITE_TTL_HOURS * 60 * 60 * 1000;

/**
 * Creates an invite and returns the raw token (the only copy that ever exists). Call inside a
 * transaction: it locks the client row first, so concurrent invites for one client run one at a time.
 */
export async function issueClientInvite(
  tx: Pick<Tx, "clientInvite" | "$executeRaw">,
  coachId: string,
  clientId: string,
  email: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: Date }> {
  await tx.$executeRaw`SELECT 1 FROM "clients" WHERE "id" = ${clientId} FOR UPDATE`;
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + INVITE_TTL_MS);
  await tx.clientInvite.deleteMany({ where: { clientId, usedAt: null } });
  await tx.clientInvite.create({ data: { coachId, clientId, email, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt };
}

export function inviteLink(base: string, token: string): string {
  return `${base}/client/set-password?token=${encodeURIComponent(token)}`;
}
