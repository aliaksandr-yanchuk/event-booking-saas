"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { parseBookingForm, type BookingFieldErrors } from "@/lib/booking-input";
import { createBooking } from "@/server/booking-service";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";
import { getOrganization, getPublicEvent } from "@/server/queries";

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
    }
  }

  updateTag(cacheTags.eventAvailability(event.id));
  redirect(`/${orgSlug}/bookings/${result.reference}`);
}
