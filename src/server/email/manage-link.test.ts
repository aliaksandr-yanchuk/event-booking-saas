/**
 * @jest-environment node
 */
import { signManageToken, verifyManageToken } from "./manage-link";

const subject = { bookingId: "booking_1", email: "aiko@example.com" };
const now = new Date("2026-10-20T03:00:00Z");
const eventStart = new Date("2026-10-28T10:00:00Z");
const secret = "test-secret";

describe("manage links", () => {
  it("accept a token for the booking and email it was made for, until it expires", () => {
    const token = signManageToken(subject, eventStart, secret);

    expect(verifyManageToken(token, subject, now, secret)).toBe(true);
    expect(verifyManageToken(token, subject, eventStart, secret)).toBe(false);
  });

  it.each([
    ["another booking", { ...subject, bookingId: "booking_2" }],
    ["another email", { ...subject, email: "ken@example.com" }],
  ])("reject a token used for %s", (_label, other) => {
    expect(verifyManageToken(signManageToken(subject, eventStart, secret), other, now, secret)).toBe(false);
  });

  it("reject tokens signed with another secret, with a changed expiry, or malformed", () => {
    const token = signManageToken(subject, eventStart, secret);
    const [, , mac] = token.split(".");
    const later = Math.floor(eventStart.getTime() / 1000) + 86_400;

    expect(verifyManageToken(signManageToken(subject, eventStart, "other"), subject, now, secret)).toBe(false);
    expect(verifyManageToken(`v1.${later}.${mac}`, subject, now, secret)).toBe(false);
    expect(verifyManageToken("v1.abc.def", subject, now, secret)).toBe(false);
    expect(verifyManageToken("", subject, now, secret)).toBe(false);
  });
});
