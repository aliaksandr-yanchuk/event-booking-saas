import type { Db } from "@/server/db";

/**
 * Read models for the public pages. Every function takes an organizationId:
 * there is deliberately no way to look up an event by slug alone, so a request
 * for one tenant can never return another tenant's data.
 */

export async function findOrganizationBySlug(db: Db, slug: string) {
  return db.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
}

export async function listOrganizations(db: Db) {
  return db.organization.findMany({
    select: { id: true, slug: true, name: true, _count: { select: { events: { where: { status: "PUBLISHED" } } } } },
    orderBy: { name: "asc" },
  });
}

export async function listUpcomingEvents(db: Db, organizationId: string, now: Date) {
  return db.event.findMany({
    where: { organizationId, status: "PUBLISHED", endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      startsAt: true,
      currency: true,
      venue: { select: { name: true, city: true } },
      sections: { select: { priceMinor: true } },
    },
  });
}

export async function findPublicEvent(db: Db, organizationId: string, slug: string) {
  const event = await db.event.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
    select: {
      id: true,
      organizationId: true,
      slug: true,
      title: true,
      summary: true,
      description: true,
      startsAt: true,
      endsAt: true,
      status: true,
      currency: true,
      maxSeatsPerBooking: true,
      updatedAt: true,
      organization: { select: { name: true, slug: true } },
      venue: { select: { name: true, address: true, city: true, country: true } },
      sections: {
        select: { id: true, name: true, priceMinor: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  // Drafts exist in the database but are not public yet.
  if (!event || event.status === "DRAFT") {
    return null;
  }

  const { organization, ...rest } = event;
  return { ...rest, organizationName: organization.name, organizationSlug: organization.slug };
}

export type PublicEvent = NonNullable<Awaited<ReturnType<typeof findPublicEvent>>>;

/** Seat map with live availability. Never cached: it must reflect the latest bookings. */
export async function getSeatMap(db: Db, eventId: string) {
  const sections = await db.section.findMany({
    where: { eventId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      priceMinor: true,
      seats: {
        select: { id: true, row: true, number: true, bookingSeats: { select: { seatId: true } } },
      },
    },
  });

  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    priceMinor: section.priceMinor,
    seats: section.seats.map((seat) => ({
      id: seat.id,
      row: seat.row,
      number: seat.number,
      taken: seat.bookingSeats.length > 0,
    })),
  }));
}

export type SeatMap = Awaited<ReturnType<typeof getSeatMap>>;

export async function countAvailableSeats(db: Db, eventId: string) {
  const [total, taken] = await Promise.all([
    db.seat.count({ where: { eventId } }),
    db.bookingSeat.count({ where: { seat: { eventId } } }),
  ]);
  return total - taken;
}

export async function listEventSitemapEntries(db: Db) {
  return db.event.findMany({
    where: { status: { in: ["PUBLISHED", "CANCELLED"] } },
    select: { slug: true, updatedAt: true, organization: { select: { slug: true } } },
  });
}
