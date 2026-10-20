import { parseIdempotencyKey } from "./idempotency-key";

describe("parseIdempotencyKey", () => {
  it("treats a missing header as no key", () => {
    expect(parseIdempotencyKey(null)).toEqual({ ok: true, key: undefined });
    expect(parseIdempotencyKey(undefined)).toEqual({ ok: true, key: undefined });
  });

  it("accepts the quoted Structured Fields form and the common unquoted form", () => {
    const uuid = "8e03978e-40d5-43e8-bc93-6894a57f9324";
    expect(parseIdempotencyKey(`"${uuid}"`)).toEqual({ ok: true, key: uuid });
    expect(parseIdempotencyKey(uuid)).toEqual({ ok: true, key: uuid });
    expect(parseIdempotencyKey(`  ${uuid} `)).toEqual({ ok: true, key: uuid });
  });

  it.each([
    ["an empty value", ""],
    ["empty quotes", '""'],
    ["only spaces", "   "],
    ["non-ASCII characters", "予約-1"],
    ["control characters", "key\u0000"],
    ["more than 255 characters", "k".repeat(256)],
  ])("rejects %s", (_label, raw) => {
    expect(parseIdempotencyKey(raw)).toMatchObject({ ok: false });
  });

  it("accepts exactly 255 characters", () => {
    expect(parseIdempotencyKey("k".repeat(255))).toMatchObject({ ok: true });
  });
});
