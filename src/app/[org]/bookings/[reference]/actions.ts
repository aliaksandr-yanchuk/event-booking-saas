"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelBooking } from "@/server/booking-service";
import { cacheTags } from "@/server/cache-tags";
import { beginCheckout } from "@/server/checkout";
import { db } from "@/server/db";
import { scheduleEmailDelivery } from "@/server/email";
import { verifyManageToken } from "@/server/email/manage-link";
import { getPaymentProvider } from "@/server/payments";
import { getOrganization } from "@/server/queries";
import { limitEmailCheck, recordFailedEmailCheck, retryAfterMessage } from "@/server/rate-limit";
import { findBookingForManage, listDemoInbox } from "@/server/repositories/bookings";

export type CancelFormState = { status: "idle" | "error"; message?: string };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter the email address you booked with."));

const CANCEL_ERRORS = {
  // Same message for a wrong email and a missing booking: don't reveal which one it was.
  NOT_FOUND: "That email does not match this booking.",
  ALREADY_CANCELLED: "This booking is already cancelled.",
  EVENT_STARTED: "The event has started, so this booking can no longer be cancelled.",
} as const;

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

  const booking = { organizationId: organization.id, reference };
  const limit = await limitEmailCheck(await headers(), booking);
  if (!limit.allowed) {
    return { status: "error", message: retryAfterMessage(limit.retryAfterSeconds) };
  }

  const result = await cancelBooking(db, getPaymentProvider(), { ...booking, customerEmail: email.data });
  if (!result.ok) {
    if (result.code === "NOT_FOUND") await recordFailedEmailCheck(booking);
    return { status: "error", message: CANCEL_ERRORS[result.code] };
  }

  updateTag(cacheTags.eventAvailability(result.eventId));
  scheduleEmailDelivery();
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

/**
 * Cancel from the signed link in an email. The token proves the customer received the
 * email, so it stands in for typing the address. It is checked again here, not only
 * when the page was shown, because the action can be called on its own.
 */
export async function cancelWithLinkAction(
  orgSlug: string,
  reference: string,
  token: string,
  // useActionState also passes the previous state, which is not needed here.
): Promise<CancelFormState> {
  const organization = await getOrganization(orgSlug);
  const booking = organization ? await findBookingForManage(db, organization.id, reference) : null;
  if (!organization || !booking || !verifyManageToken(token, { bookingId: booking.id, email: booking.customerEmail })) {
    return { status: "error", message: "This link is no longer valid. Use the form on your booking page." };
  }

  const result = await cancelBooking(db, getPaymentProvider(), {
    organizationId: organization.id,
    reference,
    customerEmail: booking.customerEmail,
  });
  if (!result.ok) {
    return { status: "error", message: CANCEL_ERRORS[result.code] };
  }
  updateTag(cacheTags.eventAvailability(result.eventId));
  scheduleEmailDelivery();
  redirect(`/${orgSlug}/bookings/${reference}`);
}

export type DemoInboxState =
  | { status: "idle" | "error"; message?: string }
  | { status: "open"; messages: { id: string; subject: string; text: string; sentAt: string }[] };

/**
 * The demo inbox: what this booking's emails would have said. It asks for the booking
 * email, like cancelling does, because the messages contain the signed cancel link.
 */
export async function readDemoInboxAction(
  orgSlug: string,
  reference: string,
  _previous: DemoInboxState,
  formData: FormData,
): Promise<DemoInboxState> {
  const email = emailSchema.safeParse(formData.get("email") ?? "");
  const organization = await getOrganization(orgSlug);
  if (!email.success || !organization) {
    return { status: "error", message: "Enter the email address you booked with." };
  }
  const booking = { organizationId: organization.id, reference };
  const limit = await limitEmailCheck(await headers(), booking);
  if (!limit.allowed) {
    return { status: "error", message: retryAfterMessage(limit.retryAfterSeconds) };
  }

  const messages = await listDemoInbox(db, organization.id, reference, email.data);
  if (!messages) {
    await recordFailedEmailCheck(booking);
    return { status: "error", message: "That email does not match this booking." };
  }
  return {
    status: "open",
    messages: messages.map((message) => ({
      id: message.id,
      subject: message.subject ?? "",
      text: message.text ?? "",
      sentAt: message.sentAt!.toISOString(),
    })),
  };
}
