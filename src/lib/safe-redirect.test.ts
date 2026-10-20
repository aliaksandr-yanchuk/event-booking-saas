import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it.each(["/dashboard", "/dashboard/harbor-hall", "/dashboard/harbor-hall/check-in?ref=7KQM-4XPA"])(
    "keeps the dashboard path %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ["another site", "https://evil.example/dashboard"],
    ["a protocol-relative URL", "//evil.example/dashboard"],
    ["a backslash trick", "/dashboard\\@evil.example"],
    ["a page outside the dashboard", "/harbor-hall"],
    ["a look-alike prefix", "/dashboarding"],
    ["a non-string", ["/dashboard"]],
    ["nothing", undefined],
  ])("falls back to /dashboard for %s", (_label, next) => {
    expect(safeNextPath(next)).toBe("/dashboard");
  });
});
