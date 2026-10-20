import { readFile } from "node:fs/promises";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts";
import { BookingCreatedResponse, EventDetailResponse } from "../src/server/api/schemas";
import { expect, test, type APIRequestContext, type Page } from "./fixtures";

const OWNER = "owner@harbor-hall.example";
const DOOR = "door@harbor-hall.example";

async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** A paid, confirmed Harbor Hall booking: held through the API, then paid on the demo checkout. */
async function confirmedBooking(page: Page, request: APIRequestContext, seatNumber: number) {
  const api = "/api/v1/organizations/harbor-hall/events/indie-rock-night";
  const { data: event } = EventDetailResponse.parse(await (await request.get(api)).json());
  const seat = event.sections[0].seats.find((s) => s.row === "D" && s.number === seatNumber)!;
  const created = await request.post(`${api}/bookings`, {
    data: { customerName: "Rin Aoki", customerEmail: "rin@example.com", seatIds: [seat.id] },
  });
  const { data: booking } = BookingCreatedResponse.parse(await created.json());
  await page.goto(booking.links.checkout!);
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText("Booking confirmed")).toBeVisible();
  return booking.reference;
}

test("the dashboard needs a sign-in, and returns to the requested page afterwards", async ({ page }) => {
  await page.goto("/dashboard/harbor-hall/check-in?ref=ABCD-EFGH");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fharbor-hall%2Fcheck-in%3Fref%3DABCD-EFGH$/);

  await signIn(page, OWNER, "not-the-password");
  // (Next.js's route announcer is an alert too, so match by text.)
  await expect(page.getByRole("alert").filter({ hasText: "The email or password is not correct." })).toBeVisible();

  // One click on a demo account fills the form and signs in.
  await page.getByRole("button", { name: `Sign in as ${OWNER}` }).click();
  await expect(page).toHaveURL(/\/dashboard\/harbor-hall\/check-in\?ref=ABCD-EFGH$/);
  await expect(page.getByRole("alert").filter({ hasText: "No booking ABCD-EFGH for Harbor Hall Live." })).toBeVisible();
});

test("owners see sales, customer emails and the CSV export", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, OWNER);

  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await expect(page.getByTestId("total-revenue")).toHaveText(/^¥[\d,]+$/);
  // Drafts are listed for the organizer, though the public never sees them.
  await expect(page.getByRole("row", { name: /Winter Gala.*Draft/ })).toBeVisible();

  await page.getByRole("link", { name: "Midnight Jazz Session" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Midnight Jazz Session" })).toBeVisible();
  await expect(page.getByText("demo0@example.com")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  const [header, ...rows] = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(header).toBe("reference,name,email,seats,status,total_minor,currency,booked_at,paid_at,checked_in_at");
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.join("\n")).toContain("demo0@example.com");
});

test("door staff see the guest list without emails, and cannot export it", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, DOOR);

  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  await expect(page.getByTestId("total-revenue")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Revenue" })).toHaveCount(0);

  await page.getByRole("link", { name: "Midnight Jazz Session" }).click();
  await expect(page.getByText("Demo Customer").first()).toBeVisible();
  await expect(page.getByText("demo0@example.com")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveCount(0);

  // The export is refused on the server too, not only hidden.
  const csv = await page.request.get("/dashboard/harbor-hall/events/midnight-jazz-session/bookings.csv");
  expect(csv.status()).toBe(403);
});

test("a guest is checked in once, from the link in their ticket's QR code", async ({ page, request }, testInfo) => {
  const reference = await confirmedBooking(page, request, testInfo.project.name === "mobile" ? 2 : 1);
  const bookingPage = page.url();
  await expect(page.getByRole("img", { name: `Ticket QR code for booking ${reference}` })).toBeVisible();

  // What the QR code opens on a staff member's phone.
  await page.goto(`/dashboard/harbor-hall/check-in?ref=${reference}`);
  await signIn(page, DOOR);
  await expect(page.getByRole("heading", { name: "Rin Aoki" })).toBeVisible();
  await page.getByRole("button", { name: "Check in 1 guest" }).click();
  await expect(page.getByRole("status")).toHaveText(/^Checked in at .+ by Taro Ito\.$/);

  // Scanning the same ticket again does not let it in twice.
  await page.reload();
  await expect(page.getByRole("button", { name: /Check in/ })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(/by Taro Ito/);

  await page.goto(bookingPage);
  await expect(page.getByText("Checked in. Enjoy the show!")).toBeVisible();
});

test("organizers cannot open each other's dashboards", async ({ page }) => {
  await page.goto("/login");
  await signIn(page, OWNER);
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();

  for (const path of ["/dashboard/kyoto-chamber", "/dashboard/kyoto-chamber/events/autumn-strings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
  const csv = await page.request.get("/dashboard/kyoto-chamber/events/autumn-strings/bookings.csv");
  expect(csv.status()).toBe(404);
});

test("signing out ends the session on the server, not only in the browser", async ({ page, context }) => {
  await page.goto("/login");
  await signIn(page, OWNER);
  await expect(page.getByRole("heading", { level: 1, name: "Events" })).toBeVisible();
  const [session] = (await context.cookies()).filter((cookie) => cookie.name.includes("seatline-session"));
  expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Put the old cookie back: the server has deleted the session, so it no longer works.
  await context.addCookies([session]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  expect((await page.request.get("/dashboard/harbor-hall/events/midnight-jazz-session/bookings.csv")).status()).toBe(
    401,
  );
});
