import { expect, test } from "@playwright/test";

const EVENT_PAGE = "/harbor-hall/events/midnight-jazz-session";

test("pages are served with security headers", async ({ request }) => {
  for (const path of ["/", EVENT_PAGE, "/api/v1/organizations/harbor-hall/events"]) {
    const headers = (await request.get(path)).headers();

    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"], path).toContain("object-src 'none'");
    expect(headers["strict-transport-security"], path).toMatch(/max-age=\d+/);
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
});

test("the content security policy does not block anything the app needs", async ({ page }) => {
  const violations: string[] = [];
  // Chromium reports CSP violations as console errors; the page itself does not fail.
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      violations.push(message.text());
    }
  });

  await page.goto("/");
  await page.getByRole("link", { name: /Harbor Hall Live/ }).click();
  await page.getByRole("link", { name: "Midnight Jazz Session" }).click();
  // Hydrated: the client component reacts to the selection.
  await page.getByRole("checkbox", { name: "Balcony, row A, seat 3", exact: true }).check({ force: true });
  await expect(page.getByRole("button", { name: /Book 1 seat/ })).toBeVisible();

  expect(violations).toEqual([]);
});
