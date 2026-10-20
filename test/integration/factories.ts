import "dotenv/config";
import { createDb, type Db } from "@/server/db";

export function createTestDb(): Db {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set.");
  }
  return createDb(url);
}

export async function resetDatabase(db: Db) {
  await db.$executeRawUnsafe(
    "TRUNCATE sessions, memberships, users, rate_limits, idempotency_keys, booking_seats, bookings, seats, sections, events, venues, organizations CASCADE",
  );
}

let counter = 0;
const unique = (prefix: string) => `${prefix}-${++counter}`;

export async function createOrganization(db: Db, slug = unique("org")) {
  return db.organization.create({ data: { slug, name: `Organizer ${slug}` } });
}

/**
 * Creates a published event with one section. `seats` controls how many seats
 * the single row "A" has; prices default to 5,000 (JPY).
 */
export async function createEventWithSeats(
  db: Db,
  organizationId: string,
  options: {
    seats?: number;
    priceMinor?: number;
    startsAt?: Date;
    status?: "DRAFT" | "PUBLISHED" | "CANCELLED";
    maxSeatsPerBooking?: number;
    slug?: string;
  } = {},
) {
  const venue = await db.venue.create({
    data: { organizationId, name: "Test Hall", address: "1-1 Test", city: "Tokyo", country: "JP" },
  });
  const startsAt = options.startsAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const event = await db.event.create({
    data: {
      organizationId,
      venueId: venue.id,
      slug: options.slug ?? unique("event"),
      title: "Test Event",
      summary: "Summary",
      description: "Description",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
      status: options.status ?? "PUBLISHED",
      maxSeatsPerBooking: options.maxSeatsPerBooking ?? 6,
    },
  });
  const section = await db.section.create({
    data: { eventId: event.id, name: "Floor", priceMinor: options.priceMinor ?? 5000 },
  });
  await db.seat.createMany({
    data: Array.from({ length: options.seats ?? 10 }, (_, i) => ({
      eventId: event.id,
      sectionId: section.id,
      row: "A",
      number: i + 1,
    })),
  });
  const seats = await db.seat.findMany({ where: { eventId: event.id }, orderBy: { number: "asc" } });
  return { event, section, seats };
}

export const customer = { customerName: "Aiko Tanaka", customerEmail: "aiko@example.com" };
