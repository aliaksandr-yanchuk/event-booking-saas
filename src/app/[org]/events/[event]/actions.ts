"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseBookingForm, type BookingFieldErrors } from "@/lib/booking-input";
import { parseIdempotencyKey } from "@/lib/idempotency-key";
import { createBooking } from "@/server/booking-service";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";
import { getOrganization, getPublicEvent } from "@/server/queries";
import { limitBooking, retryAfterMessage } from "@/server/rate-limit";

export type BookingFormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: BookingFieldErrors;
  // Seats that another customer booked first; the form marks them as taken.
  takenSeatIds?: string[];
  // Echoed back so the text fields keep their values after a failed submit.
  values?: { customerName: string; customerEmail: string };
};

// orgSlug and eventSlug are bound on the server (see page.tsx). Next.js encrypts
// bound arguments, so the client cannot swap them for another tenant's event.
export async function bookSeatsAction(
  orgSlug: string,
  eventSlug: string,
  _previous: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const values = {
    customerName: String(formData.get("customerName") ?? ""),
    customerEmail: String(formData.get("customerEmail") ?? ""),
  };

  const limit = await limitBooking(await headers());
  if (!limit.allowed) {
    return { status: "error", message: retryAfterMessage(limit.retryAfterSeconds), values };
  }

  // One key per rendered form (see page.tsx): a double submit, or a resubmit after the
  // response was lost, lands on the same booking instead of failing with "seats taken".
  const idempotencyKey = parseIdempotencyKey(formData.get("idempotencyKey")?.toString());
  if (!idempotencyKey.ok) {
    return { status: "error", message: "This form is out of date. Reload the page.", values };
  }

  const parsed = parseBookingForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  const organization = await getOrganization(orgSlug);
  const event = organization ? await getPublicEvent(organization.id, eventSlug) : null;
  if (!organization || !event) {
    return { status: "error", message: "This event no longer exists.", values };
  }

  const result = await createBooking(db, {
    ...parsed.data,
    organizationId: organization.id,
    eventId: event.id,
    idempotencyKey: idempotencyKey.key,
  });

  if (!result.ok) {
    switch (result.code) {
      case "SEATS_TAKEN":
        // Availability changed, so drop the cached seat count as well.
        updateTag(cacheTags.eventAvailability(event.id));
        return {
          status: "error",
          message:
            result.takenSeatIds.length === 1
              ? "Sorry, one of your seats was just booked by someone else. Choose another seat."
              : "Sorry, some of your seats were just booked by someone else. Choose other seats.",
          takenSeatIds: result.takenSeatIds,
          values,
        };
      case "TOO_MANY_SEATS":
        return {
          status: "error",
          fieldErrors: { seatIds: `You can book up to ${result.limit} seats at a time.` },
          values,
        };
      case "INVALID_SEATS":
        return { status: "error", message: "Some seats could not be found. Reload the page.", values };
      case "EVENT_NOT_BOOKABLE":
        return { status: "error", message: "Booking is closed for this event.", values };
      case "IDEMPOTENCY_KEY_REUSED":
        // The form already made a booking (for example, the visitor went back and changed seats).
        return {
          status: "error",
          message: "This form was already used for a booking. Reload the page to make another one.",
          values,
        };
    }
  }

  updateTag(cacheTags.eventAvailability(event.id));
  redirect(`/${orgSlug}/bookings/${result.reference}`);
}
