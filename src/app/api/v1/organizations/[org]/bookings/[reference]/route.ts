import { isBookingReference } from "@/lib/booking-reference";
import { problem } from "@/server/api/problem";
import { BookingDetailsResponse, jsonResponse } from "@/server/api/schemas";
import { toBookingDetails } from "@/server/api/serializers";
import { db } from "@/server/db";
import { findBookingByReference } from "@/server/repositories/bookings";
import { getOrganization } from "@/server/queries";

/**
 * GET /api/v1/organizations/{org}/bookings/{reference}
 * The reference works like a bearer token (it is unguessable), the same as the
 * booking page. The customer's email is never returned.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/organizations/[org]/bookings/[reference]">) {
  const { org, reference } = await ctx.params;
  const organization = isBookingReference(reference) ? await getOrganization(org) : null;
  const booking = organization ? await findBookingByReference(db, organization.id, reference) : null;
  if (!booking) {
    return problem(404, "NOT_FOUND", "No booking with this reference.");
  }

  return jsonResponse(
    BookingDetailsResponse,
    { data: toBookingDetails(booking) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
