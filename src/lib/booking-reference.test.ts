/**
 * @jest-environment node
 */
import { generateBookingReference, isBookingReference } from "./booking-reference";

describe("generateBookingReference", () => {
  it("produces the XXXX-XXXX format", () => {
    for (let i = 0; i < 100; i++) {
      expect(isBookingReference(generateBookingReference())).toBe(true);
    }
  });

  it("never uses look-alike characters", () => {
    const sample = Array.from({ length: 200 }, () => generateBookingReference()).join("");
    expect(sample).not.toMatch(/[01ILO]/);
  });

  it("is deterministic with an injected random source", () => {
    expect(generateBookingReference(() => 0)).toBe("2222-2222");
  });
});

describe("isBookingReference", () => {
  it.each(["", "ABCD", "abcd-efgh", "ABCD-EFG1", "ABCDEFGH", "ABCD-EFGH-JKMN"])("rejects %p", (value) => {
    expect(isBookingReference(value)).toBe(false);
  });
});
