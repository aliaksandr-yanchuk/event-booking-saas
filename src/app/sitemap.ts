import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { absoluteUrl } from "@/lib/site";
import { db } from "@/server/db";
import { listEventSitemapEntries, listOrganizations } from "@/server/repositories/events";

// Lists every organizer page and every published event, including past and
// cancelled ones (their pages stay up and carry an EventCancelled status).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Built per request from the database, not at build time.
  await connection();
  const [organizations, events] = await Promise.all([listOrganizations(db), listEventSitemapEntries(db)]);

  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    ...organizations.map((organization) => ({
      url: absoluteUrl(`/${organization.slug}`),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...events.map((event) => ({
      url: absoluteUrl(`/${event.organization.slug}/events/${event.slug}`),
      lastModified: event.updatedAt,
      changeFrequency: "hourly" as const,
      priority: 0.6,
    })),
  ];
}
