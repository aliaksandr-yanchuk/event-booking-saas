import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "@/i18n/config";

// All demo venues are in Japan. Formatting with an explicit time zone keeps
// server and client output identical, which avoids hydration mismatches.
const TIME_ZONE = "Asia/Tokyo";

/** "Wed, Oct 28, 2026" in English, "2026年10月28日(水)" in Japanese. */
export function formatEventDate(date: Date, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

/** "07:00 PM GMT+9" in English, "19:00 JST" in Japanese. */
export function formatEventTime(date: Date, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
    timeZoneName: "short",
  }).format(date);
}
