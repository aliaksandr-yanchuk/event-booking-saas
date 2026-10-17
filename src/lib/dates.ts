// All demo venues are in Japan. Formatting with an explicit time zone keeps
// server and client output identical, which avoids hydration mismatches.
const TIME_ZONE = "Asia/Tokyo";

export function formatEventDate(date: Date, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatEventTime(date: Date, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
    timeZoneName: "short",
  }).format(date);
}
