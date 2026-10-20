import { effectiveStatus } from "@/lib/booking-status";
import { toCsv } from "@/lib/csv";
import { getCurrentUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { findDashboardEvent, listEventBookings } from "@/server/repositories/dashboard";

/**
 * GET /dashboard/{org}/events/{event}/bookings.csv — the booking list for spreadsheets.
 * Owners only, because it contains every customer's email address. A route handler
 * cannot redirect to the login page the way a page does, so it answers with status codes.
 */
export async function GET(_request: Request, ctx: RouteContext<"/dashboard/[org]/events/[event]/bookings.csv">) {
  const { org, event: eventSlug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Sign in first.", { status: 401 });
  }
  const membership = user.memberships.find((m) => m.organization.slug === org);
  if (!membership) {
    return new Response("Not found.", { status: 404 });
  }
  if (membership.role !== "OWNER") {
    return new Response("Only owners can export bookings.", { status: 403 });
  }
  const event = await findDashboardEvent(db, membership.organization.id, eventSlug);
  if (!event) {
    return new Response("Not found.", { status: 404 });
  }

  const bookings = await listEventBookings(db, membership.organization.id, event.id);
  const csv = toCsv([
    [
      "reference",
      "name",
      "email",
      "seats",
      "status",
      "total_minor",
      "currency",
      "booked_at",
      "paid_at",
      "checked_in_at",
    ],
    ...bookings.map((booking) => [
      booking.reference,
      booking.customerName,
      booking.customerEmail,
      booking.seatLabels.join("; "),
      effectiveStatus(booking).toLowerCase(),
      booking.totalMinor,
      event.currency,
      booking.createdAt.toISOString(),
      booking.paidAt?.toISOString() ?? null,
      booking.checkedInAt?.toISOString() ?? null,
    ]),
  ]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-bookings.csv"`,
      // Personal data: never stored by a browser or proxy cache.
      "Cache-Control": "private, no-store",
    },
  });
}
