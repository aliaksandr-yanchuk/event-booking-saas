// Regenerates the screenshots in docs/ (English) and docs/ja/ (Japanese) from a running
// app with freshly seeded data:
//
//   npm run db:seed && npm run build && PORT=3200 npm run start
//   node scripts/capture-docs.mjs            # BASE_URL defaults to http://localhost:3200
//
// With FRAMES_DIR set, it also saves the frames of the booking walkthrough per language
// (FRAMES_DIR/en, FRAMES_DIR/ja), which become docs/demo.webp and docs/ja/demo.webp.
import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3200";
const framesDir = process.env.FRAMES_DIR;

// What the script clicks and waits for, per language. Each language books other seats,
// so both runs work on the same seeded data.
const LANGUAGES = {
  en: {
    prefix: "",
    docs: "docs",
    seat: (section, row, number) => `${section}, row ${row}, seat ${number}`,
    selectedSeats: [5, 6],
    bookedSeats: [7, 8],
    chooseSeats: "Choose your seats",
    fullName: "Full name",
    email: "Email",
    customer: "Aiko Tanaka",
    continueToPayment: /Continue to payment/,
    demoCheckout: "Demo checkout.",
    pay: /^Pay /,
    confirmed: "Booking confirmed",
    events: "Events",
    signInAsOwner: "Sign in as owner@harbor-hall.example",
  },
  ja: {
    prefix: "/ja",
    docs: "docs/ja",
    seat: (section, row, number) => `${section} ${row}列 ${number}番`,
    selectedSeats: [7, 8],
    bookedSeats: [9, 10],
    chooseSeats: "席を選ぶ",
    fullName: "お名前",
    email: "メールアドレス",
    customer: "田中 愛子",
    continueToPayment: /支払いへ進む/,
    demoCheckout: "デモ決済画面です。",
    pay: /を支払う$/,
    confirmed: "予約確定",
    events: "イベント",
    signInAsOwner: "owner@harbor-hall.example でログイン",
  },
};

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

const browser = await chromium.launch();

for (const [locale, l] of Object.entries(LANGUAGES)) {
  await mkdir(l.docs, { recursive: true });
  const url = (path) => `${base}${l.prefix}${path}`;
  const seat = (page, section, row, number) =>
    page.getByRole("checkbox", { name: l.seat(section, row, number), exact: true });

  // Event page, desktop (full page) and phone (first screen).
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
    await page.goto(url("/harbor-hall/events/midnight-jazz-session"));
    for (const number of l.selectedSeats) {
      await seat(page, "Floor", "C", number).check({ force: true });
    }
    await settle(page);
    await page.screenshot({ path: `${l.docs}/event-page-desktop.png`, fullPage: true });
    await page.close();

    // 1x pixels: sharp enough for a README, a third of the file size.
    const phone = await browser.newPage({ ...devices["Pixel 7"], deviceScaleFactor: 1, colorScheme: "light" });
    await phone.goto(url("/harbor-hall/events/midnight-jazz-session"));
    await phone.getByRole("group", { name: l.chooseSeats }).waitFor();
    await phone.screenshot({ path: `${l.docs}/event-page-mobile.png` });
    await phone.close();
  }

  // Booking walkthrough: seats, details, demo checkout, ticket with QR code.
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, colorScheme: "light" });
    let frame = 0;
    const snap = async () => {
      if (framesDir) {
        await mkdir(`${framesDir}/${locale}`, { recursive: true });
        await settle(page);
        await page.screenshot({ path: `${framesDir}/${locale}/${String(frame++).padStart(2, "0")}.png` });
      }
    };

    await page.goto(url("/harbor-hall/events/midnight-jazz-session"));
    await page.getByRole("group", { name: l.chooseSeats }).waitFor();
    await snap();
    await page.getByRole("group", { name: l.chooseSeats }).scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 200);
    await snap();
    for (const number of l.bookedSeats) {
      await seat(page, "Floor", "D", number).check({ force: true });
      await snap();
    }
    await page.getByLabel(l.fullName).fill(l.customer);
    await page.getByLabel(l.email).fill("aiko@example.com");
    await page.getByLabel(l.email).scrollIntoViewIfNeeded();
    await snap();
    await page.getByRole("button", { name: l.continueToPayment }).click();
    await page.getByText(l.demoCheckout).waitFor();
    await snap();
    await page.getByRole("button", { name: l.pay }).click();
    await page.getByText(l.confirmed).waitFor();
    await snap();
    await page.screenshot({ path: `${l.docs}/booking-ticket.png`, fullPage: true });
    await page.close();
  }

  // Organizer dashboard, signed in as the demo owner.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
    await page.goto(url("/login"));
    await page.getByRole("button", { name: l.signInAsOwner }).click();
    await page.getByRole("heading", { level: 1, name: l.events }).waitFor();
    await settle(page);
    await page.screenshot({ path: `${l.docs}/dashboard.png`, fullPage: true });
    await page.close();
  }
}

await browser.close();
console.log("Screenshots written to docs/ and docs/ja/" + (framesDir ? `, frames to ${framesDir}` : ""));
