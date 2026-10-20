/**
 * Reads an idempotency key sent by a client.
 *
 * The IETF draft (draft-ietf-httpapi-idempotency-key-header) defines the header as a
 * Structured Fields string, which is quoted: `Idempotency-Key: "8e03978e-…"`. Many APIs
 * (Stripe, for example) send it unquoted, so both forms are accepted. A UUID v4 is the
 * recommended value; any printable ASCII up to 255 characters works.
 */
export type IdempotencyKeyResult = { ok: true; key: string | undefined } | { ok: false; message: string };

const MAX_LENGTH = 255;

export function parseIdempotencyKey(raw: string | null | undefined): IdempotencyKeyResult {
  // No key: the request is simply not idempotent.
  if (raw === null || raw === undefined) {
    return { ok: true, key: undefined };
  }
  const quoted = /^"(.*)"$/.exec(raw.trim());
  const key = (quoted ? quoted[1] : raw).trim();

  if (key.length === 0 || key.length > MAX_LENGTH || !/^[\x20-\x7e]+$/.test(key)) {
    return { ok: false, message: `Use 1–${MAX_LENGTH} printable ASCII characters, for example a UUID.` };
  }
  return { ok: true, key };
}
