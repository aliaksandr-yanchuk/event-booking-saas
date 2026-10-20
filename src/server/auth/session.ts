import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@/server/db";

/**
 * Database sessions. The cookie carries 256 random bits; the database stores only
 * their SHA-256, so reading the sessions table does not give anyone a valid cookie.
 * Signing out deletes the row, which ends the session everywhere at once (a signed,
 * stateless cookie would stay valid until it expires).
 */

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// "__Host-" makes the browser refuse the cookie unless it is Secure, host-only and for
// path "/". Secure cookies need HTTPS (localhost is exempt in Chrome and Firefox), so
// development uses a plain name over http.
const secure = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = {
  name: secure ? "__Host-seatline-session" : "seatline-session",
  options: { httpOnly: true, secure, sameSite: "lax", path: "/" },
} as const;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: Db, userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  // Also clears this user's expired sessions, so the table does not grow forever.
  await db.$transaction([
    db.session.deleteMany({ where: { userId, expiresAt: { lte: now } } }),
    db.session.create({ data: { id: hashToken(token), userId, expiresAt } }),
  ]);
  return { token, expiresAt };
}

/** The user ID of a valid session, or null for an unknown or expired token. */
export async function findSessionUserId(db: Db, token: string, now = new Date()): Promise<string | null> {
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    select: { userId: true, expiresAt: true },
  });
  return session && session.expiresAt > now ? session.userId : null;
}

export async function deleteSession(db: Db, token: string) {
  await db.session.deleteMany({ where: { id: hashToken(token) } });
}
