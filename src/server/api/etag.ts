import { createHash } from "node:crypto";

/**
 * Conditional GET support. A client (or the browser's HTTP cache) that already has the
 * current representation sends its ETag in If-None-Match and gets an empty 304 instead
 * of the full body. The seat map is polled while a visitor looks at an event, and most
 * polls find nothing new, so most of them become 304s.
 */

/** A strong ETag: the hash of the exact JSON bytes that Response.json sends. */
export function etagFor(body: unknown): string {
  return `"${createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 27)}"`;
}

/**
 * If-None-Match uses the weak comparison (RFC 9110 §13.1.2): W/"x" matches "x".
 * The header may list several tags, or be "*" (matches any current representation).
 */
export function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (!header) {
    return false;
  }
  if (header.trim() === "*") {
    return true;
  }
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some((tag) => opaque(tag) === opaque(etag));
}
