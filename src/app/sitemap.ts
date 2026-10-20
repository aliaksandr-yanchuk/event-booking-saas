import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { LOCALES, localizePath } from "@/i18n/config";
import { absoluteUrl } from "@/lib/site";
import { db } from "@/server/db";
import { listEventSitemapEntries, listOrganizations } from "@/server/repositories/events";

// Lists every organizer page and every published event, including past and
// cancelled ones (their pages stay up and carry an EventCancelled status),
// once per language, each with links to its other-language versions.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Built per request from the database, not at build time.
  await connection();
  const [organizations, events] = await Promise.all([listOrganizations(db), listEventSitemapEntries(db)]);

  const pages: { path: string; changeFrequency: "daily" | "hourly"; priority: number; lastModified?: Date }[] = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    ...organizations.map((organization) => ({
      path: `/${organization.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...events.map((event) => ({
      path: `/${event.organization.slug}/events/${event.slug}`,
      lastModified: event.updatedAt,
      changeFrequency: "hourly" as const,
      priority: 0.6,
    })),
  ];

  return pages.flatMap(({ path, ...entry }) =>
    LOCALES.map((locale) => ({
      url: absoluteUrl(localizePath(locale, path)),
      ...entry,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, absoluteUrl(localizePath(l, path))])),
      },
    })),
  );
}
