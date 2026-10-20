"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelBooking } from "@/server/booking-service";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";
import { beginCheckout } from "@/server/checkout";
import { getPaymentProvider } from "@/server/payments";
import { getOrganization } from "@/server/queries";
import { limitCancellation, retryAfterMessage } from "@/server/rate-limit";

export type CancelFormState = { status: "idle" | "error"; message?: string };

const emailSchema = z.string().trim().pipe(z.email("Enter the email address you booked with."));

export async function cancelBookingAction(
  orgSlug: string,
  reference: string,
  _previous: CancelFormState,
  formData: FormData,
): Promise<CancelFormState> {
  const email = emailSchema.safeParse(formData.get("customerEmail") ?? "");
  if (!email.success) {
    return { status: "error", message: email.error.issues[0]?.message };
  }

  const organization = await getOrganization(orgSlug);
  if (!organization) {
    return { status: "error", message: "Booking not found." };
  }

  const limit = await limitCancellation(await headers(), { organizationId: organization.id, reference });
  if (!limit.allowed) {
    return { status: "error", message: retryAfterMessage(limit.retryAfterSeconds) };
  }

  const result = await cancelBooking(db, getPaymentProvider(), {
    organizationId: organization.id,
    reference,
    customerEmail: email.data,
  });

  if (!result.ok) {
    const messages = {
      // Same message for a wrong email and a missing booking: don't reveal which one it was.
      NOT_FOUND: "That email does not match this booking.",
      ALREADY_CANCELLED: "This booking is already cancelled.",
      EVENT_STARTED: "The event has started, so this booking can no longer be cancelled.",
    } as const;
    return { status: "error", message: messages[result.code] };
  }

  updateTag(cacheTags.eventAvailability(result.eventId));
  // Re-render the page so it shows the cancelled state.
  refresh();
  return { status: "idle" };
}

/** "Continue to payment" on a pending booking: resumes its checkout (or creates it). */
export async function continueToPaymentAction(orgSlug: string, reference: string) {
  const organization = await getOrganization(orgSlug);
  if (!organization) {
    redirect(`/${orgSlug}/bookings/${reference}`);
  }
  const checkout = await beginCheckout(organization, reference);
  // Not pending any more (paid meanwhile, or expired): the booking page shows the state.
  redirect(checkout.ok ? checkout.url : `/${orgSlug}/bookings/${reference}`);
}
