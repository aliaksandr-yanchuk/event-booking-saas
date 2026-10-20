import { effectiveStatus } from "./booking-status";

describe("effectiveStatus", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("shows a hold that has run out as expired", () => {
    expect(effectiveStatus({ status: "PENDING", expiresAt: new Date("2026-10-20T11:59:59Z") }, now)).toBe("EXPIRED");
    expect(effectiveStatus({ status: "PENDING", expiresAt: now }, now)).toBe("EXPIRED");
  });

  it("keeps every other status as stored", () => {
    expect(effectiveStatus({ status: "PENDING", expiresAt: new Date("2026-10-20T12:00:01Z") }, now)).toBe("PENDING");
    expect(effectiveStatus({ status: "CONFIRMED", expiresAt: null }, now)).toBe("CONFIRMED");
    expect(effectiveStatus({ status: "REFUNDED", expiresAt: null }, now)).toBe("REFUNDED");
  });
});
