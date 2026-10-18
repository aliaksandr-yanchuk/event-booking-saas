import { revalidateTag } from "next/cache";
import { problem, readJson } from "@/server/api/problem";
import { BookingCancelledResponse, CancelBookingRequest, jsonResponse } from "@/server/api/schemas";
import { cancelBooking } from "@/server/booking-service";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";
import { getOrganization } from "@/server/queries";

/**
 * POST /api/v1/organizations/{org}/bookings/{reference}/cancel
 * Body: { "customerEmail": string }
 *
 * A POST to a sub-resource rather than DELETE: the request needs a body (the email
 * as a second factor), and the booking is kept with status "cancelled", not removed.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/v1/organizations/[org]/bookings/[reference]/cancel">,
) {
  const { org, reference } = await ctx.params;

  const json = await readJson(request);
  if (!json.ok) {
    return json.response;
  }
  const body = CancelBookingRequest.safeParse(json.body);
  if (!body.success) {
    return problem(400, "VALIDATION_FAILED", undefined, {
      errors: { customerEmail: body.error.issues[0]?.message ?? "Invalid value." },
    });
  }

  const organization = await getOrganization(org);
  if (!organization) {
    return problem(404, "NOT_FOUND", "No booking with this reference and email.");
  }

  const result = await cancelBooking(db, {
    organizationId: organization.id,
    reference,
    customerEmail: body.data.customerEmail,
  });

  if (!result.ok) {
    switch (result.code) {
      case "NOT_FOUND":
        // Same response for an unknown reference and a wrong email: don't reveal which.
        return problem(404, "NOT_FOUND", "No booking with this reference and email.");
      case "ALREADY_CANCELLED":
        return problem(409, "ALREADY_CANCELLED");
      case "EVENT_STARTED":
        return problem(422, "EVENT_STARTED", "Bookings cannot be cancelled after the event starts.");
    }
  }

  revalidateTag(cacheTags.eventAvailability(result.eventId), { expire: 0 });
  return jsonResponse(BookingCancelledResponse, { data: { reference, status: "cancelled" } });
}
