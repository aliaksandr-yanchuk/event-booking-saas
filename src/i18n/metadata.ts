import type { Metadata } from "next";
import { DEFAULT_LOCALE, LOCALES, localizePath, type Locale } from "@/i18n/config";

/**
 * Canonical URL and hreflang alternates for a page that exists in every language,
 * so search engines show each reader the version in their language.
 */
export function localizedAlternates(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: localizePath(locale, path),
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, localizePath(l, path)])),
      "x-default": localizePath(DEFAULT_LOCALE, path),
    },
  };
}
