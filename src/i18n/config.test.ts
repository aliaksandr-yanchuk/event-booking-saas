import { fill, localizePath, plural, splitLocale } from "./config";

describe("localizePath / splitLocale", () => {
  it("keeps English unprefixed and puts Japanese under /ja", () => {
    expect(localizePath("en", "/harbor-hall")).toBe("/harbor-hall");
    expect(localizePath("ja", "/harbor-hall")).toBe("/ja/harbor-hall");
    expect(localizePath("ja", "/")).toBe("/ja");
  });

  it("splits a public path into language and path, and round-trips", () => {
    expect(splitLocale("/ja/harbor-hall/events/x")).toEqual({ locale: "ja", path: "/harbor-hall/events/x" });
    expect(splitLocale("/ja")).toEqual({ locale: "ja", path: "/" });
    expect(splitLocale("/harbor-hall")).toEqual({ locale: "en", path: "/harbor-hall" });
    // An organizer slug that merely starts with "ja" is not Japanese.
    expect(splitLocale("/jazz-club")).toEqual({ locale: "en", path: "/jazz-club" });
    for (const path of ["/", "/harbor-hall", "/dashboard/x/check-in"]) {
      const { locale, path: rest } = splitLocale(localizePath("ja", path));
      expect([locale, rest]).toEqual(["ja", path]);
    }
  });
});

describe("fill / plural", () => {
  it("fills placeholders and leaves unknown ones alone", () => {
    expect(fill("Pay {amount} for {seats}", { amount: "¥8,000", seats: 2 })).toBe("Pay ¥8,000 for 2");
    expect(fill("{unknown}", {})).toBe("{unknown}");
  });

  it("chooses the singular or plural form", () => {
    const seats = { one: "{count} seat", other: "{count} seats" };
    expect(plural(seats, 1)).toBe("1 seat");
    expect(plural(seats, 3)).toBe("3 seats");
  });
});
