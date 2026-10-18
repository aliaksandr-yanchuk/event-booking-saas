import type { PublicEvent, SeatMap } from "@/server/repositories/events";

/**
 * API response shapes. These are the public contract, kept separate from the
 * database models so a schema change does not silently change the API.
 * Prices are integers in the currency's minor unit, with the currency alongside.
 */

type EventListItem = {
  slug: string;
  title: string;
  summary: string;
  startsAt: Date;
  currency: string;
  venue: { name: string; city: string };
  sections: { priceMinor: number }[];
};

export function toEventSummary(event: EventListItem, organizationSlug: string) {
  const prices = event.sections.map((section) => section.priceMinor);
  return {
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    startsAt: event.startsAt.toISOString(),
    venue: event.venue,
    priceRange: prices.length
      ? { currency: event.currency, minMinor: Math.min(...prices), maxMinor: Math.max(...prices) }
      : null,
    links: { self: `/api/v1/organizations/${organizationSlug}/events/${event.slug}` },
  };
}

export function toEventDetail(event: PublicEvent, seatMap: SeatMap) {
  const seatsLeft = seatMap.reduce(
    (count, section) => count + section.seats.filter((seat) => !seat.taken).length,
    0,
  );
  return {
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    description: event.description,
    status: event.status.toLowerCase(),
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    currency: event.currency,
    maxSeatsPerBooking: event.maxSeatsPerBooking,
    organizer: { slug: event.organizationSlug, name: event.organizationName },
    venue: event.venue,
    seatsLeft,
    sections: seatMap.map((section) => ({
      name: section.name,
      priceMinor: section.priceMinor,
      seats: section.seats.map((seat) => ({
        id: seat.id,
        row: seat.row,
        number: seat.number,
        available: !seat.taken,
      })),
    })),
  };
}
