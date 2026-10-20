// Regenerates the screenshots in docs/ from a running app with freshly seeded data:
//
//   npm run db:seed && npm run build && PORT=3200 npm run start
//   node scripts/capture-docs.mjs            # BASE_URL defaults to http://localhost:3200
//
// With FRAMES_DIR set, it also saves the frames of the booking walkthrough (docs/demo.webp).
import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3200";
const framesDir = process.env.FRAMES_DIR;
const browser = await chromium.launch();

// Seats fade to their selected color; capture after the fade, not halfway through it.
const settle = (page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );

const seat = (page, section, row, number) =>
  page.getByRole("checkbox", { name: `${section}, row ${row}, seat ${number}`, exact: true });

// Event page, desktop (full page) and phone (first screen).
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  await page.goto(`${base}/harbor-hall/events/midnight-jazz-session`);
  await seat(page, "Floor", "C", 5).check({ force: true });
  await seat(page, "Floor", "C", 6).check({ force: true });
  await settle(page);
  await page.screenshot({ path: "docs/event-page-desktop.png", fullPage: true });
  await page.close();

  // 1x pixels: sharp enough for a README, a third of the file size.
  const phone = await browser.newPage({ ...devices["Pixel 7"], deviceScaleFactor: 1, colorScheme: "light" });
  await phone.goto(`${base}/harbor-hall/events/midnight-jazz-session`);
  await phone.getByRole("group", { name: "Choose your seats" }).waitFor();
  await phone.screenshot({ path: "docs/event-page-mobile.png" });
  await phone.close();
}

// Booking walkthrough: seats, details, demo checkout, ticket with QR code.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, colorScheme: "light" });
  let frame = 0;
  const snap = async () => {
    if (framesDir) {
      await mkdir(framesDir, { recursive: true });
      await settle(page);
      await page.screenshot({ path: `${framesDir}/${String(frame++).padStart(2, "0")}.png` });
    }
  };

  await page.goto(`${base}/harbor-hall/events/midnight-jazz-session`);
  await page.getByRole("group", { name: "Choose your seats" }).waitFor();
  await snap();
  await page.getByRole("group", { name: "Choose your seats" }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await snap();
  for (const number of [7, 8]) {
    await seat(page, "Floor", "D", number).check({ force: true });
    await snap();
  }
  await page.getByLabel("Full name").fill("Aiko Tanaka");
  await page.getByLabel("Email").fill("aiko@example.com");
  await page.getByLabel("Email").scrollIntoViewIfNeeded();
  await snap();
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await page.getByText("Demo checkout.").waitFor();
  await snap();
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.getByText("Booking confirmed").waitFor();
  await snap();
  await page.screenshot({ path: "docs/booking-ticket.png", fullPage: true });
  await page.close();
}

// Organizer dashboard, signed in as the demo owner.
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: "Sign in as owner@harbor-hall.example" }).click();
  await page.getByRole("heading", { level: 1, name: "Events" }).waitFor();
  await settle(page);
  await page.screenshot({ path: "docs/dashboard.png", fullPage: true });
  await page.close();
}

await browser.close();
console.log("Screenshots written to docs/" + (framesDir ? ` and frames to ${framesDir}` : ""));
