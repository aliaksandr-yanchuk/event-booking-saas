import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db";
import { cacheTags } from "@/server/cache-tags";
import * as events from "@/server/repositories/events";

/**
 * Cached reads for the public pages. The repositories hold the queries and are
 * tested against a real database; this module only adds caching on top.
 *
 * Event details change rarely, so they are cached for minutes. Seat availability
 * is cached only briefly and is invalidated as soon as a booking is made.
 * The seat map itself (getSeatMap) is never cached.
 */

export async function getOrganizations() {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.organizations());
  return events.listOrganizations(db);
}

export async function getOrganization(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(cacheTags.organizations());
  return events.findOrganizationBySlug(db, slug);
}

export async function getUpcomingEvents(organizationId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(cacheTags.organizationEvents(organizationId));
  // The cache entry lives for minutes, so "now" is precise enough here.
  return events.listUpcomingEvents(db, organizationId, new Date());
}

export async function getPublicEvent(organizationId: string, slug: string) {
  "use cache";
  cacheLife("minutes");
  const event = await events.findPublicEvent(db, organizationId, slug);
  if (event) {
    cacheTag(cacheTags.event(event.id));
  }
  return event;
}

export async function getAvailableSeatCount(eventId: string) {
  "use cache";
  cacheLife("seconds");
  cacheTag(cacheTags.eventAvailability(eventId));
  return events.countAvailableSeats(db, eventId);
}

export async function getSeatMap(eventId: string) {
  return events.getSeatMap(db, eventId);
}
