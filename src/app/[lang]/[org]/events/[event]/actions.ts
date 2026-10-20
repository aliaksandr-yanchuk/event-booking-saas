"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { dictionaryFor } from "@/i18n";
import { fill, localizePath, type Locale } from "@/i18n/config";
import { parseBookingForm, type BookingFieldErrors } from "@/lib/booking-input";
import { parseIdempotencyKey } from "@/lib/idempotency-key";
import { createBooking } from "@/server/booking-service";
import { cacheTags } from "@/server/cache-tags";
import { beginCheckout } from "@/server/checkout";
import { scheduleEmailDelivery } from "@/server/email";
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

// orgSlug, eventSlug and the page's language are bound on the server (see page.tsx).
// Next.js encrypts bound arguments, so the client cannot swap them for another tenant's event.
export async function bookSeatsAction(
  orgSlug: string,
  eventSlug: string,
  locale: Locale,
  _previous: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const t = dictionaryFor(locale);
  const values = {
    customerName: String(formData.get("customerName") ?? ""),
    customerEmail: String(formData.get("customerEmail") ?? ""),
  };

  const limit = await limitBooking(await headers());
  if (!limit.allowed) {
    return { status: "error", message: retryAfterMessage(limit.retryAfterSeconds, t.rateLimited), values };
  }

  // One key per rendered form (see page.tsx): a double submit, or a resubmit after the
  // response was lost, lands on the same booking instead of failing with "seats taken".
  const idempotencyKey = parseIdempotencyKey(formData.get("idempotencyKey")?.toString());
  if (!idempotencyKey.ok) {
    return { status: "error", message: t.bookingErrors.formOutOfDate, values };
  }

  const parsed = parseBookingForm(formData, t.validation);
  if (!parsed.success) {
    return {
      status: "error",
      message: t.bookingErrors.checkFields,
      fieldErrors: parsed.fieldErrors,
      values,
    };
  }

  const organization = await getOrganization(orgSlug);
  const event = organization ? await getPublicEvent(organization.id, eventSlug) : null;
  if (!organization || !event) {
    return { status: "error", message: t.bookingErrors.eventGone, values };
  }

  const result = await createBooking(db, {
    ...parsed.data,
    organizationId: organization.id,
    eventId: event.id,
    idempotencyKey: idempotencyKey.key,
    locale,
  });

  if (!result.ok) {
    switch (result.code) {
      case "SEATS_TAKEN":
        // Availability changed, so drop the cached seat count as well.
        updateTag(cacheTags.eventAvailability(event.id));
        return {
          status: "error",
          message: result.takenSeatIds.length === 1 ? t.bookingErrors.seatTakenOne : t.bookingErrors.seatTakenMany,
          takenSeatIds: result.takenSeatIds,
          values,
        };
      case "TOO_MANY_SEATS":
        return {
          status: "error",
          fieldErrors: { seatIds: fill(t.bookingErrors.tooManySeats, { limit: result.limit }) },
          values,
        };
      case "INVALID_SEATS":
        return { status: "error", message: t.bookingErrors.invalidSeats, values };
      case "EVENT_NOT_BOOKABLE":
        return { status: "error", message: t.bookingErrors.closed, values };
      case "IDEMPOTENCY_KEY_REUSED":
        // The form already made a booking (for example, the visitor went back and changed seats).
        return { status: "error", message: t.bookingErrors.formReused, values };
    }
  }

  updateTag(cacheTags.eventAvailability(event.id));
  // A free booking has queued its confirmation email.
  scheduleEmailDelivery();

  // Paid seats are held now; send the customer to pay. A free booking is already confirmed.
  const bookingPage = localizePath(locale, `/${orgSlug}/bookings/${result.reference}`);
  if (result.status === "PENDING") {
    const checkout = await openCheckout(organization, result.reference, locale);
    // Not ok: the hold has meanwhile been paid, cancelled or has expired (a replayed
    // submit); the booking page shows which.
    redirect(checkout?.ok ? checkout.url : bookingPage);
  }
  redirect(bookingPage);
}

/**
 * The checkout is created after the hold. If the provider is unreachable, the seats
 * stay held and the booking page offers "Continue to payment", which tries again.
 */
async function openCheckout(organization: { id: string; slug: string }, reference: string, locale: Locale) {
  try {
    return await beginCheckout(organization, reference, locale);
  } catch (error) {
    console.error("Could not start the checkout", { reference, error });
    return null;
  }
}
