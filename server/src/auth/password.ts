// Password hashing (Prompt 43). bcrypt via bcryptjs: a pure-JavaScript bcrypt, so there is no
// native module to compile on Render or Windows. Passwords are never stored, returned or
// logged in plain text - only the bcrypt hash (which includes its own random salt).
import bcrypt from "bcryptjs";

/** bcrypt cost factor: 2^12 rounds (about 0.2-0.3 s per hash on a small server). */
export const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
