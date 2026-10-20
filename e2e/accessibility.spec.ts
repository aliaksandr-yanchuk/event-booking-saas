import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "./fixtures";
import { BookingCreatedResponse, EventDetailResponse } from "../src/server/api/schemas";

// Automated WCAG 2.2 A/AA checks with axe-core, in light and dark mode, on every page type.
// axe finds about a third of accessibility problems (contrast, names, labels, landmarks,
// ARIA misuse); keyboard use and screen reader output are covered by the flow tests.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoViolations(page: Page) {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    // Elements with transition-colors fade to the new theme; measure contrast after the fade,
    // not halfway between the light and dark colors.
    // Only transitions: a looping skeleton pulse never finishes, and a removed element's
    // transition is cancelled (its promise rejects), which also means it no longer matters.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    // Report each offending element with axe's explanation, not the whole result object.
    const summary = violations.flatMap((v) =>
      v.nodes.map((node) => `${v.id} at ${node.target.join(" ")}: ${node.any[0]?.message ?? v.help}`),
    );
    expect(summary, `${colorScheme} mode`).toEqual([]);
  }
}

test("home and organizer pages", async ({ page }) => {
  await page.goto("/");
  await expectNoViolations(page);

  await page.goto("/harbor-hall");
  await expectNoViolations(page);
});

test("event page, including the form with validation errors", async ({ page }) => {
  await page.goto("/harbor-hall/events/midnight-jazz-session");
  await expect(page.getByRole("group", { name: "Choose your seats" })).toBeVisible();
  await expectNoViolations(page);

  await page.getByRole("button", { name: "Book seats" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expectNoViolations(page);
});

test("closed event page", async ({ page }) => {
  await page.goto("/kyoto-chamber/events/new-year-concert");
  await expect(page.getByText("This event has been cancelled.")).toBeVisible();
  await expectNoViolations(page);
});

test("booking page awaiting payment, and the demo checkout", async ({ page, request }, testInfo) => {
  // Book through the API, so this test does not depend on the booking form.
  const api = "/api/v1/organizations/harbor-hall/events/midnight-jazz-session";
  const { data: event } = EventDetailResponse.parse(await (await request.get(api)).json());
  const seatNumber = testInfo.project.name === "mobile" ? 2 : 1;
  const seat = event.sections
    .find((section) => section.name === "Balcony")
    ?.seats.find((s) => s.row === "C" && s.number === seatNumber);
  const created = await request.post(`${api}/bookings`, {
    data: { customerName: "Mio Ito", customerEmail: "mio@example.com", seatIds: [seat!.id] },
  });
  const { data: booking } = BookingCreatedResponse.parse(await created.json());

  await page.goto(booking.links.page);
  await expect(page.getByText("Awaiting payment")).toBeVisible();
  await expectNoViolations(page);

  await page.goto(booking.links.checkout!);
  await expect(page.getByText("Demo checkout.")).toBeVisible();
  await expectNoViolations(page);

  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();
  await expectNoViolations(page);

  // The demo inbox with the confirmation email, and the page its link opens.
  await page.getByRole("region", { name: "Demo inbox" }).getByLabel("Your email address").fill("mio@example.com");
  const confirmation = page.getByRole("article", { name: /^Your booking for Midnight Jazz Session/ });
  await expect(async () => {
    await page.getByRole("button", { name: /Open inbox|Refresh inbox/ }).click();
    await expect(confirmation).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expectNoViolations(page);

  await page.goto((await confirmation.getByRole("link", { name: /\/manage\?t=/ }).getAttribute("href"))!);
  await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
  await expectNoViolations(page);
});

test("not found page", async ({ page }) => {
  await page.goto("/harbor-hall/events/no-such-event");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expectNoViolations(page);
});

test("login page and the organizer dashboard", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Organizer sign-in" })).toBeVisible();
  await expectNoViolations(page);

  await page.getByRole("button", { name: "Sign in as owner@harbor-hall.example" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await expectNoViolations(page);

  await page.getByRole("link", { name: "Midnight Jazz Session" }).click();
  await expect(page.getByRole("region", { name: "Bookings" })).toBeVisible();
  await expectNoViolations(page);

  await page.getByRole("link", { name: "Check-in", exact: true }).click();
  await page.getByLabel("Booking reference").fill("ABCD-EFGH");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText("No booking ABCD-EFGH")).toBeVisible();
  await expectNoViolations(page);
});

test("Japanese pages", async ({ page }) => {
  for (const path of ["/ja", "/ja/harbor-hall/events/midnight-jazz-session", "/ja/login"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expectNoViolations(page);
  }
});
