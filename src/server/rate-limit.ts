import { db as defaultDb, type Db } from "@/server/db";

/**
 * Rate limits for the write endpoints, stored in PostgreSQL (table rate_limits), so
 * every server instance shares the same counters and no extra service is needed.
 *
 * Fixed windows: the first hit starts a window, and hits are counted until it ends.
 * A client can send up to twice the limit around a window boundary; for slowing down
 * scripts that is fine, and it keeps the whole check one atomic SQL statement.
 */

const MINUTE = 60_000;

export type RateLimitRule = { limit: number; windowMs: number };

export const rateLimits = {
  // Generous for a person picking seats, low for a script.
  bookingPerClient: { limit: 20, windowMs: 10 * MINUTE },
  cancelPerClient: { limit: 10, windowMs: 10 * MINUTE },
  // Cancelling needs the booking's email. This stops guessing it for a known
  // reference, even from many addresses.
  cancelPerBooking: { limit: 5, windowMs: 60 * MINUTE },
  // Password guessing: per address, and per account from any number of addresses.
  loginPerClient: { limit: 10, windowMs: 10 * MINUTE },
  loginPerAccount: { limit: 5, windowMs: 15 * MINUTE },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Counts one hit for `key` and says whether it is within the rule's limit. */
export async function consumeRateLimit(
  db: Db,
  key: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<RateLimitResult> {
  // A window that started at or before this moment has ended.
  const expiredAt = new Date(now.getTime() - rule.windowMs);

  // One statement, so concurrent hits cannot both read the old count. In the UPDATE,
  // rate_limits.* is the row before the update, so both CASEs see the same old window.
  const [row] = await db.$queryRaw<{ count: number; remainingMs: number }[]>`
    INSERT INTO rate_limits ("key", "windowStart", "count")
    VALUES (${key}, ${now}::timestamp(3), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limits."windowStart" <= ${expiredAt}::timestamp(3) THEN 1
                     ELSE rate_limits."count" + 1 END,
      "windowStart" = CASE WHEN rate_limits."windowStart" <= ${expiredAt}::timestamp(3) THEN ${now}::timestamp(3)
                           ELSE rate_limits."windowStart" END
    RETURNING "count",
      (EXTRACT(EPOCH FROM ("windowStart" - ${expiredAt}::timestamp(3))) * 1000)::float8 AS "remainingMs"`;

  if (row.count <= rule.limit) {
    return { allowed: true };
  }
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(row.remainingMs / 1000)) };
}

/**
 * The client's IP address. Vercel (and any reverse proxy in front of the Docker image)
 * sets X-Forwarded-For and overwrites what the client sent; without a proxy, Next.js
 * sets it from the connection. Clients without an address share one bucket.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

export function limitBooking(headers: Headers, db: Db = defaultDb) {
  return consumeRateLimit(db, `booking:client:${clientAddress(headers)}`, rateLimits.bookingPerClient);
}

export async function limitCancellation(
  headers: Headers,
  booking: { organizationId: string; reference: string },
  db: Db = defaultDb,
): Promise<RateLimitResult> {
  const perClient = await consumeRateLimit(db, `cancel:client:${clientAddress(headers)}`, rateLimits.cancelPerClient);
  if (!perClient.allowed) {
    return perClient;
  }
  return consumeRateLimit(
    db,
    `cancel:booking:${booking.organizationId}:${booking.reference}`,
    rateLimits.cancelPerBooking,
  );
}

/**
 * Before checking a password: every attempt counts per address, but per account only
 * failures count (see recordFailedLogin). Otherwise everyone signing in to the shared
 * demo accounts would use up their limit.
 */
export async function limitLogin(headers: Headers, email: string, db: Db = defaultDb): Promise<RateLimitResult> {
  const perClient = await consumeRateLimit(db, `login:client:${clientAddress(headers)}`, rateLimits.loginPerClient);
  if (!perClient.allowed) {
    return perClient;
  }
  return peekRateLimit(db, `login:account:${email}`, rateLimits.loginPerAccount);
}

export async function recordFailedLogin(email: string, db: Db = defaultDb) {
  await consumeRateLimit(db, `login:account:${email}`, rateLimits.loginPerAccount);
}

/** Whether `key` is over the limit, without counting a hit. */
export async function peekRateLimit(
  db: Db,
  key: string,
  rule: RateLimitRule,
  now = new Date(),
): Promise<RateLimitResult> {
  const row = await db.rateLimit.findUnique({ where: { key }, select: { count: true, windowStart: true } });
  const remainingMs = row ? row.windowStart.getTime() + rule.windowMs - now.getTime() : 0;
  if (!row || remainingMs <= 0 || row.count < rule.limit) {
    return { allowed: true };
  }
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
}

/** "Try again in 3 minutes." for the forms. */
export function retryAfterMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
