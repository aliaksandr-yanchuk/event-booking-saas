import type { z } from "zod";
import { API_BOOKING_STATUS, effectiveStatus } from "@/lib/booking-status";
import type { BookingDetailsResponse, EventDetail, EventSummary } from "@/server/api/schemas";
import type { BookingDetails } from "@/server/repositories/bookings";
import type { PublicEvent, SeatMap } from "@/server/repositories/events";

/**
 * Convert database read models into the public API shapes defined in schemas.ts.
 * The return types come from the Zod schemas, so these functions cannot drift
 * from the documented contract without a type error.
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

export function toEventSummary(event: EventListItem, organizationSlug: string): z.output<typeof EventSummary> {
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

export function toEventDetail(event: PublicEvent, seatMap: SeatMap): z.output<typeof EventDetail> {
  const seatsLeft = seatMap.reduce((count, section) => count + section.seats.filter((seat) => !seat.taken).length, 0);
  return {
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    description: event.description,
    // Drafts never reach the API (findPublicEvent filters them out).
    status: event.status === "CANCELLED" ? "cancelled" : "published",
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

export function toBookingDetails(booking: BookingDetails): z.output<typeof BookingDetailsResponse>["data"] {
  return {
    reference: booking.reference,
    status: API_BOOKING_STATUS[effectiveStatus(booking)],
    expiresAt: effectiveStatus(booking) === "PENDING" ? booking.expiresAt!.toISOString() : null,
    customerName: booking.customerName,
    seats: booking.seatLabels,
    totalMinor: booking.totalMinor,
    currency: booking.event.currency,
    createdAt: booking.createdAt.toISOString(),
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    event: {
      slug: booking.event.slug,
      title: booking.event.title,
      startsAt: booking.event.startsAt.toISOString(),
      venue: booking.event.venue,
    },
  };
}
