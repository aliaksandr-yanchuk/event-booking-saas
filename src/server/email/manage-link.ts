import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed "manage your booking" links for emails. Cancelling normally needs the booking
 * email as a second factor next to the reference; a link that was delivered to that
 * email proves the same thing, so it lets the customer cancel without typing it.
 *
 * Token: "v1.<expires, unix seconds>.<HMAC-SHA256 of booking ID, email and expiry>".
 * It is bound to the email, so changing the booking's email would invalidate old links.
 */

const DEV_SECRET = "development-only-booking-link-secret";

export function linkSecret(): string {
  const secret = process.env.BOOKING_LINK_SECRET;
  if (secret) return secret;
  // A fixed secret is fine on a developer's machine; in production, a missing secret must
  // not silently produce links that anyone could forge.
  if (process.env.NODE_ENV !== "production") return DEV_SECRET;
  throw new Error("BOOKING_LINK_SECRET is not set. Generate one with: openssl rand -base64 32");
}

type LinkSubject = { bookingId: string; email: string };

function signature(subject: LinkSubject, expires: number, secret: string) {
  return createHmac("sha256", secret).update(`${subject.bookingId}\n${subject.email}\n${expires}`).digest("base64url");
}

export function signManageToken(subject: LinkSubject, expiresAt: Date, secret = linkSecret()): string {
  const expires = Math.floor(expiresAt.getTime() / 1000);
  return `v1.${expires}.${signature(subject, expires, secret)}`;
}

export function verifyManageToken(
  token: string,
  subject: LinkSubject,
  now = new Date(),
  secret = linkSecret(),
): boolean {
  const [version, expiresText, given] = token.split(".");
  const expires = Number(expiresText);
  if (version !== "v1" || !Number.isInteger(expires) || !given || expires * 1000 <= now.getTime()) {
    return false;
  }
  const expected = Buffer.from(signature(subject, expires, secret));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
