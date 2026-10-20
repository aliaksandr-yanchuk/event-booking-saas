/**
 * @jest-environment node
 */
import { etagFor, matchesIfNoneMatch } from "./etag";

describe("etagFor", () => {
  it("is stable for the same body and changes when the body changes", () => {
    const body = { data: { seats: [{ id: "a", available: true }] } };

    expect(etagFor(body)).toBe(etagFor(structuredClone(body)));
    expect(etagFor(body)).not.toBe(etagFor({ data: { seats: [{ id: "a", available: false }] } }));
    expect(etagFor(body)).toMatch(/^"[\w-]{27}"$/);
  });
});

describe("matchesIfNoneMatch", () => {
  const etag = '"abc"';

  it.each([
    ['"abc"', true],
    ['W/"abc"', true],
    ['"x", "abc"', true],
    ["*", true],
    ['"abd"', false],
    ["", false],
  ])("%j → %s", (header, expected) => {
    expect(matchesIfNoneMatch(header, etag)).toBe(expected);
  });

  it("does not match without the header", () => {
    expect(matchesIfNoneMatch(null, etag)).toBe(false);
  });
});
