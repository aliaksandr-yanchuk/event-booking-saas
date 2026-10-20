import { expect, test, type Page } from "./fixtures";

// Both projects (desktop, mobile) run against the same seeded database,
// so each one books seats in its own row to stay independent.
function rowFor(projectName: string) {
  return projectName === "mobile" ? "D" : "B";
}

const seat = (page: Page, section: string, row: string, number: number) =>
  page.getByRole("checkbox", { name: `${section}, row ${row}, seat ${number}`, exact: true });

test("a visitor finds an event, books two seats and sees them taken afterwards", async ({ page }, testInfo) => {
  const row = rowFor(testInfo.project.name);

  await page.goto("/");
  await page.getByRole("link", { name: /Harbor Hall Live/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Harbor Hall Live" })).toBeVisible();

  await page.getByRole("link", { name: "Midnight Jazz Session" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Midnight Jazz Session" })).toBeVisible();

  // Seats booked in the seed data are disabled.
  await expect(page.getByRole("checkbox", { name: "Floor, row A, seat 5, taken" })).toBeDisabled();

  // Checkboxes are visually hidden behind the seat tiles, so click the tile (label).
  await seat(page, "Floor", row, 1).check({ force: true });
  await seat(page, "Floor", row, 2).check({ force: true });
  await expect(page.getByTestId("booking-total")).toHaveText("¥16,000");

  // Submitting without contact details shows field errors and keeps the selection.
  await page.getByRole("button", { name: "Book 2 seats · ¥16,000" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await expect(seat(page, "Floor", row, 1)).toBeChecked();

  await page.getByLabel("Full name").fill("Aiko Tanaka");
  await page.getByLabel("Email").fill("aiko@example.com");
  await page.getByRole("button", { name: "Book 2 seats · ¥16,000" }).click();

  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await expect(page.getByTestId("booking-reference")).toHaveText(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  await expect(page.getByText(`Floor · Row ${row} · Seat 1`)).toBeVisible();
  await expect(page.getByText("¥16,000")).toBeVisible();

  await page.getByRole("link", { name: "Back to the event" }).click();
  await expect(page.getByRole("checkbox", { name: `Floor, row ${row}, seat 1, taken` })).toBeDisabled();
});

test("a customer cancels a booking with their email, which releases the seat", async ({ page }, testInfo) => {
  const row = testInfo.project.name === "mobile" ? "C" : "A";

  await page.goto("/harbor-hall/events/indie-rock-night");
  await seat(page, "Balcony", row, 1).check({ force: true });
  await page.getByLabel("Full name").fill("Ken Sato");
  await page.getByLabel("Email").fill("ken@example.com");
  await page.getByRole("button", { name: /Book 1 seat/ }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();

  const emailField = page.getByLabel("Email used for the booking");
  await emailField.fill("wrong@example.com");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("That email does not match this booking.")).toBeVisible();

  await emailField.fill("ken@example.com");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Booking cancelled")).toBeVisible();
  await expect(page.getByText("Your seats have been released.")).toBeVisible();

  await page.getByRole("link", { name: "Back to the event" }).click();
  await expect(seat(page, "Balcony", row, 1)).toBeEnabled();
});

test("event pages expose structured data and a canonical URL", async ({ page }) => {
  await page.goto("/kyoto-chamber/events/autumn-strings");

  const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(jsonLd).toMatchObject({
    "@type": "Event",
    name: "Autumn Strings: Dvořák & Tchaikovsky",
    location: { address: { addressLocality: "Kyoto" } },
    offers: { priceCurrency: "JPY", lowPrice: "6000", highPrice: "9000" },
  });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/kyoto-chamber\/events\/autumn-strings$/,
  );
});

test("event pages have a generated Open Graph image for link previews", async ({ page }) => {
  await page.goto("/kyoto-chamber/events/autumn-strings");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

  // The tag holds an absolute URL built from SITE_URL; request its path from the test server.
  const imageUrl = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!);
  const image = await page.request.get(imageUrl.pathname + imageUrl.search);

  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  // A PNG stores its width and height as 32-bit integers at bytes 16–23 (IHDR chunk).
  const png = await image.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});

test("cancelled events stay visible but cannot be booked", async ({ page }) => {
  await page.goto("/kyoto-chamber/events/new-year-concert");

  await expect(page.getByText("This event has been cancelled. Bookings are closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Book/ })).toHaveCount(0);
});

test("draft events and other tenants' slugs are not found", async ({ page }) => {
  await page.goto("/harbor-hall/events/winter-gala");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  // The event exists, but under a different organizer.
  await page.goto("/kyoto-chamber/events/midnight-jazz-session");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("the seat map updates live when someone else books a selected seat", async ({ page, request }, testInfo) => {
  const number = testInfo.project.name === "mobile" ? 2 : 1;
  await page.goto("/harbor-hall/events/midnight-jazz-session");
  await seat(page, "Balcony", "B", number).check({ force: true });
  await expect(page.getByTestId("booking-total")).toHaveText("¥5,000");

  // Another customer books the same seat through the API while the page stays open.
  const seatId = await seat(page, "Balcony", "B", number).getAttribute("value");
  const booked = await request.post("/api/v1/organizations/harbor-hall/events/midnight-jazz-session/bookings", {
    data: { customerName: "Ren Mori", customerEmail: "ren@example.com", seatIds: [seatId] },
  });
  expect(booked.status()).toBe(201);

  // Without a reload: the next poll (every 5 s) marks the seat taken and drops it.
  await expect(page.getByRole("checkbox", { name: `Balcony, row B, seat ${number}, taken` })).toBeDisabled({
    timeout: 10_000,
  });
  await expect(page.getByRole("status")).toHaveText(
    `Balcony · Row B · Seat ${number} was just booked by someone else and was removed from your selection.`,
  );
  await expect(page.getByTestId("booking-total")).toHaveText("¥0");
});
