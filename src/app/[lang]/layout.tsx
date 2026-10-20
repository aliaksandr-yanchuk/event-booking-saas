import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { LanguageLinks, LanguageSwitcher } from "@/components/language-switcher";
import { getDictionary } from "@/i18n";
import { LOCALES, localizePath } from "@/i18n/config";
import { SITE_NAME, siteUrl } from "@/lib/site";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// One static shell per language. (Cache Components requires a value for every root param.)
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return {
    metadataBase: siteUrl(),
    title: { default: `${SITE_NAME} — ${t.site.tagline}`, template: `%s · ${SITE_NAME}` },
    description: t.site.description,
    openGraph: { siteName: SITE_NAME, type: "website" },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getDictionary();
  const href = (path: string) => localizePath(locale, path);

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only rounded bg-accent px-3 py-2 text-accent-foreground focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
        >
          {t.site.skipToContent}
        </a>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
            <Link href={href("/")} className="text-lg font-semibold tracking-tight">
              {SITE_NAME}
            </Link>
            <div className="flex items-center gap-5">
              {/* A plain link, so the header stays static; the dashboard checks the session. */}
              <Link href={href("/dashboard")} className="text-sm font-medium text-muted hover:text-foreground">
                {t.site.forOrganizers}
              </Link>
              <Suspense
                fallback={<LanguageLinks names={t.site.languageNames} label={t.site.language} current={locale} />}
              >
                <LanguageSwitcher names={t.site.languageNames} label={t.site.language} />
              </Suspense>
            </div>
          </div>
        </header>
        {/*
          At least one screen tall: pages stream their content in after a short skeleton, and
          a footer visible on the first paint would jump down when it arrives (layout shift).
        */}
        <main id="main" className="mx-auto min-h-svh w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-border py-6 text-center text-sm text-muted">{t.site.footer}</footer>
      </body>
    </html>
  );
}
