/**
 * Demo data: two organizers (tenants), each with its own venue and events.
 * Dates are relative to "now", so the seeded events are always upcoming.
 *
 * Run with: npm run db:seed  (wipes all data in DATABASE_URL first)
 */
import "dotenv/config";
import { generateBookingReference } from "../src/lib/booking-reference";
import { createDb, type Db } from "../src/server/db";

const DAY = 24 * 60 * 60 * 1000;

type SectionSpec = { name: string; priceMinor: number; rows: string[]; seatsPerRow: number };

const ROWS = (from: string, count: number) =>
  Array.from({ length: count }, (_, i) => String.fromCharCode(from.charCodeAt(0) + i));

async function createEvent(
  db: Db,
  input: {
    organizationId: string;
    venueId: string;
    slug: string;
    title: string;
    summary: string;
    description: string;
    startsInDays: number;
    durationHours: number;
    status?: "DRAFT" | "PUBLISHED" | "CANCELLED";
    sections: SectionSpec[];
    // Seats booked in advance, so the seat map shows some taken seats.
    preBooked?: { section: string; row: string; numbers: number[] }[];
  },
) {
  const startsAt = new Date(Math.ceil(Date.now() / DAY) * DAY + input.startsInDays * DAY + 10 * 60 * 60 * 1000);
  const event = await db.event.create({
    data: {
      organizationId: input.organizationId,
      venueId: input.venueId,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      description: input.description,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.durationHours * 60 * 60 * 1000),
      status: input.status ?? "PUBLISHED",
    },
  });

  for (const [sortOrder, spec] of input.sections.entries()) {
    const section = await db.section.create({
      data: { eventId: event.id, name: spec.name, priceMinor: spec.priceMinor, sortOrder },
    });
    await db.seat.createMany({
      data: spec.rows.flatMap((row) =>
        Array.from({ length: spec.seatsPerRow }, (_, i) => ({
          eventId: event.id,
          sectionId: section.id,
          row,
          number: i + 1,
        })),
      ),
    });
  }

  for (const [index, hold] of (input.preBooked ?? []).entries()) {
    const seats = await db.seat.findMany({
      where: { eventId: event.id, row: hold.row, number: { in: hold.numbers }, section: { name: hold.section } },
      include: { section: true },
    });
    await db.booking.create({
      data: {
        organizationId: input.organizationId,
        eventId: event.id,
        reference: generateBookingReference(),
        customerName: "Demo Customer",
        customerEmail: `demo${index}@example.com`,
        totalMinor: seats.reduce((sum, seat) => sum + seat.section.priceMinor, 0),
        seatLabels: seats.map((seat) => `${seat.section.name} · Row ${seat.row} · Seat ${seat.number}`),
        seats: { create: seats.map((seat) => ({ seatId: seat.id })) },
      },
    });
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const db = createDb(url);

  await db.$executeRawUnsafe(
    "TRUNCATE booking_seats, bookings, seats, sections, events, venues, organizations CASCADE",
  );

  const harbor = await db.organization.create({ data: { slug: "harbor-hall", name: "Harbor Hall Live" } });
  const harborVenue = await db.venue.create({
    data: {
      organizationId: harbor.id,
      name: "Harbor Hall",
      address: "2-1 Kaigan-dori, Naka-ku",
      city: "Yokohama",
      country: "JP",
    },
  });

  await createEvent(db, {
    organizationId: harbor.id,
    venueId: harborVenue.id,
    slug: "midnight-jazz-session",
    title: "Midnight Jazz Session",
    summary: "A late-night set of modern jazz standards by the Harbor Quartet.",
    description:
      "The Harbor Quartet returns with an evening of reworked standards and new compositions. " +
      "Doors open 30 minutes before the show. Drinks are available at the bar on the first floor.",
    startsInDays: 7,
    durationHours: 2,
    sections: [
      { name: "Floor", priceMinor: 8000, rows: ROWS("A", 5), seatsPerRow: 12 },
      { name: "Balcony", priceMinor: 5000, rows: ROWS("A", 3), seatsPerRow: 10 },
    ],
    preBooked: [
      { section: "Floor", row: "A", numbers: [5, 6, 7, 8] },
      { section: "Floor", row: "C", numbers: [1, 2] },
      { section: "Balcony", row: "B", numbers: [4, 5, 6] },
    ],
  });

  await createEvent(db, {
    organizationId: harbor.id,
    venueId: harborVenue.id,
    slug: "indie-rock-night",
    title: "Indie Rock Night",
    summary: "Three up-and-coming Yokohama bands on one stage.",
    description: "Three local bands play back-to-back sets. Standing room near the stage, seated balcony.",
    startsInDays: 21,
    durationHours: 3,
    sections: [{ name: "Balcony", priceMinor: 4500, rows: ROWS("A", 4), seatsPerRow: 10 }],
  });

  await createEvent(db, {
    organizationId: harbor.id,
    venueId: harborVenue.id,
    slug: "winter-gala",
    title: "Winter Gala (draft)",
    summary: "Not announced yet.",
    description: "Draft events are stored but never shown publicly.",
    startsInDays: 60,
    durationHours: 3,
    status: "DRAFT",
    sections: [{ name: "Floor", priceMinor: 12000, rows: ROWS("A", 2), seatsPerRow: 8 }],
  });

  const kyoto = await db.organization.create({ data: { slug: "kyoto-chamber", name: "Kyoto Chamber Orchestra" } });
  const kyotoVenue = await db.venue.create({
    data: {
      organizationId: kyoto.id,
      name: "Okazaki Concert Hall",
      address: "13 Okazaki Saishoji-cho, Sakyo-ku",
      city: "Kyoto",
      country: "JP",
    },
  });

  await createEvent(db, {
    organizationId: kyoto.id,
    venueId: kyotoVenue.id,
    slug: "autumn-strings",
    title: "Autumn Strings: Dvořák & Tchaikovsky",
    summary: "Serenades for strings by Dvořák and Tchaikovsky.",
    description:
      "The orchestra's autumn program pairs two of the best-loved string serenades. " +
      "A pre-concert talk starts one hour before the performance.",
    startsInDays: 10,
    durationHours: 2,
    sections: [
      { name: "S", priceMinor: 9000, rows: ROWS("A", 4), seatsPerRow: 14 },
      { name: "A", priceMinor: 6000, rows: ROWS("E", 4), seatsPerRow: 14 },
    ],
    preBooked: [{ section: "S", row: "B", numbers: [6, 7, 8, 9] }],
  });

  await createEvent(db, {
    organizationId: kyoto.id,
    venueId: kyotoVenue.id,
    slug: "new-year-concert",
    title: "New Year Concert",
    summary: "Waltzes and polkas to start the year.",
    description: "A program of Strauss waltzes and polkas, cancelled due to venue maintenance.",
    startsInDays: 45,
    durationHours: 2,
    status: "CANCELLED",
    sections: [{ name: "S", priceMinor: 7000, rows: ROWS("A", 2), seatsPerRow: 10 }],
  });

  console.log("Seeded 2 organizers and 5 events.");
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
