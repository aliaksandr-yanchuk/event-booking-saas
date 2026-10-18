import { revalidateTag } from "next/cache";
import { parseBookingInput } from "@/lib/booking-input";
import { problem, readJson } from "@/server/api/problem";
import { resolveEvent } from "@/server/api/resolve";
import { createBooking } from "@/server/booking-service";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";

/**
 * POST /api/v1/organizations/{org}/events/{event}/bookings
 * Body: { "customerName": string, "customerEmail": string, "seatIds": string[] }
 *
 * 201 with the booking and a Location header, or a problem response:
 * 400 invalid body, 404 unknown organizer/event, 409 seats already booked,
 * 415 not JSON, 422 the request is valid JSON but breaks a booking rule.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/v1/organizations/[org]/events/[event]/bookings">,
) {
  const { org, event: eventSlug } = await ctx.params;

  const json = await readJson(request);
  if (!json.ok) {
    return json.response;
  }
  const input = parseBookingInput(json.body);
  if (!input.success) {
    const hasFieldErrors = Object.keys(input.fieldErrors).length > 0;
    return problem(
      400,
      "VALIDATION_FAILED",
      hasFieldErrors ? undefined : "The body must be a JSON object.",
      hasFieldErrors ? { errors: input.fieldErrors } : {},
    );
  }

  const resolved = await resolveEvent(org, eventSlug);
  if (!resolved.ok) {
    return resolved.response;
  }
  const { organization, event } = resolved;

  const result = await createBooking(db, { ...input.data, organizationId: organization.id, eventId: event.id });

  if (!result.ok) {
    switch (result.code) {
      case "SEATS_TAKEN":
        revalidateTag(cacheTags.eventAvailability(event.id), { expire: 0 });
        return problem(409, "SEATS_TAKEN", "Another customer booked these seats first.", {
          takenSeatIds: result.takenSeatIds,
        });
      case "TOO_MANY_SEATS":
        return problem(422, "TOO_MANY_SEATS", `This event allows up to ${result.limit} seats per booking.`, {
          limit: result.limit,
        });
      case "INVALID_SEATS":
        return problem(422, "INVALID_SEATS");
      case "EVENT_NOT_BOOKABLE":
        return problem(422, "EVENT_NOT_BOOKABLE", "The event is cancelled or has already started.");
    }
  }

  // expire: 0 drops the cached seat count now, so the next page view is up to date.
  revalidateTag(cacheTags.eventAvailability(event.id), { expire: 0 });

  const location = `/api/v1/organizations/${organization.slug}/bookings/${result.reference}`;
  return Response.json(
    {
      data: {
        reference: result.reference,
        status: "confirmed",
        totalMinor: result.totalMinor,
        currency: event.currency,
        seatIds: input.data.seatIds,
        links: { self: location, page: `/${organization.slug}/bookings/${result.reference}` },
      },
    },
    { status: 201, headers: { Location: location } },
  );
}
