import { splitLocale } from "@/i18n/config";

/**
 * The page to return to after signing in. Only dashboard paths on this site (in any
 * language): an attacker's link to /login?next=https://evil.example (or //evil.example,
 * which browsers treat as another host) must not turn the login page into an open redirect.
 */
export function safeNextPath(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || /[\\\s]/.test(next)) {
    return fallback;
  }
  const { path } = splitLocale(next);
  if (!/^\/dashboard(?:[/?#]|$)/.test(path)) {
    return fallback;
  }
  // Resolving against a dummy origin catches anything that would leave the site.
  const url = new URL(next, "https://seatline.invalid");
  return url.origin === "https://seatline.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
}
