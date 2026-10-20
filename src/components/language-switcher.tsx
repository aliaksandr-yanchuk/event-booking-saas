"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALES, localizePath, splitLocale, type Locale } from "@/i18n/config";

/**
 * Links to the current page in the other languages. A client component: it needs the
 * current path, and the layout around it stays a static shell.
 */
export function LanguageSwitcher({ names, label }: { names: Record<Locale, string>; label: string }) {
  const { locale: current, path } = splitLocale(usePathname());
  return <LanguageLinks names={names} label={label} current={current} path={path} />;
}

/**
 * The same links without the current path, for the static shell (the path is only known
 * per request): the other language links to its home page until the switcher streams in.
 */
export function LanguageLinks({
  names,
  label,
  current,
  path = "/",
}: {
  names: Record<Locale, string>;
  label: string;
  current: Locale;
  path?: string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex items-center gap-3 text-sm">
        {LOCALES.map((locale) => (
          <li key={locale}>
            {locale === current ? (
              <span aria-current="true" className="font-medium">
                {names[locale]}
              </span>
            ) : (
              <Link
                href={localizePath(locale, path)}
                hrefLang={locale}
                lang={locale}
                className="text-muted hover:text-foreground"
              >
                {names[locale]}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
