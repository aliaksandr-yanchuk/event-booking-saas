import { formatEventDate, formatEventTime } from "./dates";

const date = new Date("2026-10-28T10:00:00Z"); // 19:00 in Tokyo

describe("event dates", () => {
  it("formats in English by default, in the venue's time zone", () => {
    expect(formatEventDate(date)).toBe("Wed, Oct 28, 2026");
    expect(formatEventTime(date)).toBe("07:00 PM GMT+9");
  });

  it("formats in Japanese", () => {
    expect(formatEventDate(date, "ja")).toBe("2026年10月28日(水)");
    expect(formatEventTime(date, "ja")).toBe("19:00 JST");
  });
});
