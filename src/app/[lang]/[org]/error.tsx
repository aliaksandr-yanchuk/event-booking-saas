"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { buttonClasses } from "@/components/ui/button";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { dictionaryFor } from "@/i18n/dictionaries";

// Catches rendering errors below /[org], so a failing event page keeps the
// site header and offers a retry instead of a blank screen.
export default function OrganizationError({ error, retry }: { error: unknown; retry: () => void }) {
  // An error boundary gets no props from the page, so it reads the language from the URL.
  const { lang } = useParams<{ lang: string }>();
  const t = dictionaryFor(isLocale(lang) ? lang : DEFAULT_LOCALE).error;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-muted">{t.text}</p>
      <button type="button" onClick={() => retry()} className={buttonClasses("secondary")}>
        {t.retry}
      </button>
    </div>
  );
}
