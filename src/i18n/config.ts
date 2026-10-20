/**
 * Languages and URLs. Usable on the server and in the browser.
 *
 * English has no prefix (/harbor-hall), so the URLs from before Japanese existed keep
 * working; Japanese lives under /ja (/ja/harbor-hall). src/proxy.ts rewrites unprefixed
 * paths to /en internally, so every page sits under app/[lang].
 */
export const LOCALES = ["en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** For Intl.DateTimeFormat and Intl.NumberFormat. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", ja: "ja-JP" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The public URL path of a page in a language: "/harbor-hall" → "/ja/harbor-hall". */
export function localizePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Splits a public path into its language and the path without the prefix. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    if (pathname === `/${locale}`) return { locale, path: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, path: pathname.slice(locale.length + 1) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname };
}

/** Fills "{name}" placeholders: fill("Hello {name}", { name: "Aiko" }). */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** Singular or plural form ("1 seat", "2 seats"); Japanese uses the same text for both. */
export function plural(forms: { one: string; other: string }, count: number): string {
  return fill(count === 1 ? forms.one : forms.other, { count });
}
