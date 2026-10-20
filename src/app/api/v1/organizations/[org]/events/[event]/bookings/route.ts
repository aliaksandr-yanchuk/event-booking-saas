import { revalidateTag } from "next/cache";
import { parseBookingInput } from "@/lib/booking-input";
import { API_BOOKING_STATUS, effectiveStatus } from "@/lib/booking-status";
import { parseIdempotencyKey } from "@/lib/idempotency-key";
import { problem, rateLimited, readJson } from "@/server/api/problem";
import { resolveEvent } from "@/server/api/resolve";
import { BookingCreatedResponse, jsonResponse } from "@/server/api/schemas";
import { createBooking } from "@/server/booking-service";
import { cacheTags } from "@/server/cache-tags";
import { beginCheckout } from "@/server/checkout";
import { scheduleEmailDelivery } from "@/server/email";
import { db } from "@/server/db";
import { limitBooking } from "@/server/rate-limit";

/**
 * POST /api/v1/organizations/{org}/events/{event}/bookings
 * Body: { "customerName": string, "customerEmail": string, "seatIds": string[] }
 * Optional header: Idempotency-Key, so a client can safely retry after a timeout.
 *
 * 201 with the booking and a Location header, or a problem response:
 * 400 invalid body or key, 404 unknown organizer/event, 409 seats already booked,
 * 415 not JSON, 429 too many attempts from this client, 422 the request is valid JSON but breaks a booking rule
 * (or reuses an idempotency key for a different request).
 * A retry with the same key gets the original 201 again, marked Idempotent-Replayed.
 *
 * Paid seats are held (status pending_payment) until the customer pays at links.checkout;
 * free bookings are confirmed at once. 502 if the payment provider is unreachable: the
 * seats are held, and a retry with the same Idempotency-Key returns the checkout link.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/organizations/[org]/events/[event]/bookings">) {
  const { org, event: eventSlug } = await ctx.params;

  // Counted before anything else, so invalid requests cannot be sent at full speed either.
  const limit = await limitBooking(request.headers);
  if (!limit.allowed) {
    return rateLimited(limit.retryAfterSeconds);
  }

  const idempotencyKey = parseIdempotencyKey(request.headers.get("idempotency-key"));
  if (!idempotencyKey.ok) {
    return problem(400, "VALIDATION_FAILED", undefined, { errors: { "Idempotency-Key": idempotencyKey.message } });
  }

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

  const result = await createBooking(db, {
    ...input.data,
    organizationId: organization.id,
    eventId: event.id,
    idempotencyKey: idempotencyKey.key,
  });

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
      case "IDEMPOTENCY_KEY_REUSED":
        return problem(
          422,
          "IDEMPOTENCY_KEY_REUSED",
          "Send a new key for a new booking; reuse a key only to retry the exact same request.",
        );
    }
  }

  // expire: 0 drops the cached seat count now, so the next page view is up to date.
  revalidateTag(cacheTags.eventAvailability(event.id), { expire: 0 });
  scheduleEmailDelivery();

  const status = effectiveStatus(result);
  let checkoutUrl: string | null = null;
  let expiresAt = result.expiresAt;
  if (status === "PENDING") {
    try {
      // The API speaks English; its checkout and links are the English ones.
      const checkout = await beginCheckout(organization, result.reference, "en");
      if (checkout.ok) {
        // Creating the checkout renews the hold.
        checkoutUrl = checkout.url;
        expiresAt = checkout.expiresAt;
      }
    } catch (error) {
      console.error("Could not start the checkout", { reference: result.reference, error });
      return problem(
        502,
        "PAYMENT_UNAVAILABLE",
        "The seats are held, but the payment provider did not answer. Retry with the same Idempotency-Key.",
      );
    }
  }

  const location = `/api/v1/organizations/${organization.slug}/bookings/${result.reference}`;
  return jsonResponse(
    BookingCreatedResponse,
    {
      data: {
        reference: result.reference,
        status: API_BOOKING_STATUS[status],
        totalMinor: result.totalMinor,
        currency: event.currency,
        seatIds: input.data.seatIds,
        expiresAt: status === "PENDING" ? expiresAt!.toISOString() : null,
        links: {
          self: location,
          page: `/${organization.slug}/bookings/${result.reference}`,
          checkout: checkoutUrl,
        },
      },
    },
    {
      status: 201,
      // Same status and body as the original response, so a retrying client needs no special case.
      headers: { Location: location, ...(result.replayed && { "Idempotent-Replayed": "true" }) },
    },
  );
}
