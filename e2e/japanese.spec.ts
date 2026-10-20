import { expect, test, type Page } from "./fixtures";

// The Japanese site lives under /ja; English URLs stay unprefixed (see src/proxy.ts).
// Uses row C of the free Open Rehearsal, which the other specs leave alone.

const seat = (page: Page, row: string, number: number) =>
  page.getByRole("checkbox", { name: `Hall ${row}列 ${number}番`, exact: true });

test("Japanese pages are in Japanese, and the switcher keeps the visitor on the same page", async ({ page }) => {
  await page.goto("/ja");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { level: 1, name: "ライブイベントの座席指定予約" })).toBeVisible();

  await page.getByRole("link", { name: /Harbor Hall Live/ }).click();
  await expect(page).toHaveURL(/\/ja\/harbor-hall$/);
  await page.getByRole("link", { name: "Midnight Jazz Session" }).click();
  await expect(page).toHaveURL(/\/ja\/harbor-hall\/events\/midnight-jazz-session$/);
  await expect(page.getByText("2026年").first()).toBeVisible();
  await expect(page.getByRole("group", { name: "席を選ぶ" })).toBeVisible();

  // Search engines get the other language as an alternate of the same page. (Loaded directly:
  // after client-side navigation, the previous page stays mounted, hidden, with its own tags.)
  await page.goto("/ja/harbor-hall/events/midnight-jazz-session");
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    "href",
    /\/harbor-hall\/events\/midnight-jazz-session$/,
  );

  // The static shell links to the English home page; the link to this very page streams in
  // a moment later (the current path is only known per request).
  const english = page.getByRole("navigation", { name: "言語" }).getByRole("link", { name: "English" });
  await expect(english).toHaveAttribute("href", "/harbor-hall/events/midnight-jazz-session");
  await english.click();
  await expect(page).toHaveURL(/\/harbor-hall\/events\/midnight-jazz-session$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("group", { name: "Choose your seats" })).toBeVisible();
});

test("a Japanese visitor books, and the booking, email and links stay Japanese", async ({ page }, testInfo) => {
  const number = testInfo.project.name === "mobile" ? 2 : 1;
  await page.goto("/ja/kyoto-chamber/events/open-rehearsal");

  // Validation messages come in the page's language.
  await page.getByRole("button", { name: "予約する" }).click();
  await expect(page.getByText("お名前を入力してください。")).toBeVisible();
  await expect(page.getByText("席を 1 つ以上選んでください。")).toBeVisible();

  await seat(page, "C", number).check({ force: true });
  await page.getByLabel("お名前").fill("佐藤 健");
  await page.getByLabel("メールアドレス").fill("ken.sato@example.com");
  await page.getByRole("button", { name: "1席を予約する" }).click();

  await expect(page).toHaveURL(/\/ja\/kyoto-chamber\/bookings\/[2-9A-Z-]+$/);
  await expect(page.getByText("予約確定")).toBeVisible();
  // Seat labels are stored in the language the customer booked in.
  await expect(page.getByText(`Hall C列 ${number}番`).filter({ visible: true })).toBeVisible();
  const reference = await page.getByTestId("booking-reference").textContent();

  await page.getByRole("region", { name: "デモ受信箱" }).getByLabel("メールアドレス").fill("ken.sato@example.com");
  const confirmation = page.getByRole("article", { name: `Open Rehearsal のご予約が確定しました(${reference})` });
  await expect(async () => {
    await page.getByRole("button", { name: /受信箱を開く|受信箱を更新/ }).click();
    await expect(confirmation).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await expect(confirmation).toContainText("佐藤 健 様");

  // The email's manage link opens the Japanese page.
  const manageLink = confirmation.getByRole("link", { name: /\/ja\/kyoto-chamber\/bookings\/.+\/manage\?t=/ });
  await page.goto((await manageLink.getAttribute("href"))!);
  await expect(page.getByRole("heading", { name: "佐藤 健 様の予約をキャンセルしますか?" })).toBeVisible();
  await page.getByRole("button", { name: "予約をキャンセル" }).click();
  await expect(page.getByText("予約キャンセル済み")).toBeVisible();
});

test("the dashboard and its login page are in Japanese under /ja", async ({ page }) => {
  await page.goto("/ja/dashboard");
  await expect(page).toHaveURL(/\/ja\/login\?next=%2Fja%2Fdashboard$/);
  await expect(page.getByRole("heading", { name: "主催者ログイン" })).toBeVisible();

  await page.getByRole("button", { name: "owner@harbor-hall.example でログイン" }).click();
  await expect(page).toHaveURL(/\/ja\/dashboard\/harbor-hall$/);
  await expect(page.getByRole("heading", { level: 1, name: "イベント" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "売上" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Winter Gala.*下書き/ })).toBeVisible();

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/ja\/login$/);
});

test("unknown Japanese pages get a Japanese 404", async ({ page }) => {
  // The event is looked up after the page has started streaming, so the status stays 200;
  // Next.js marks such pages noindex instead.
  await page.goto("/ja/harbor-hall/events/no-such-event");
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();

  await page.goto("/ja/a/b/c/d");
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  await page.goto("/a/b/c/d");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
