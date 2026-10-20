import type { BookingStatus, EventStatus, Prisma } from "@/generated/prisma/client";
import type { Db } from "@/server/db";
import { staleHoldWhere } from "@/server/holds";

/**
 * Read models for the organizer dashboard. Like the public repositories, every function
 * takes the organizationId, and callers get it from requireMembership(), never from the
 * URL, so a user can only ever see the organizers they belong to.
 */

export type EventSales = {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  status: EventStatus;
  currency: string;
  capacity: number;
  sold: number;
  held: number;
  revenueMinor: number;
  checkedIn: number;
};

/** Every event of the organizer (drafts too) with its sales, in one query. */
export async function listEventSales(db: Db, organizationId: string, now = new Date()): Promise<EventSales[]> {
  return db.$queryRaw<EventSales[]>`
    SELECT e.id, e.slug, e.title, e."startsAt", e.status, e.currency,
      (SELECT count(*) FROM seats s WHERE s."eventId" = e.id)::int AS capacity,
      (SELECT count(*) FROM booking_seats bs JOIN bookings b ON b.id = bs."bookingId"
        WHERE b."eventId" = e.id AND b.status = 'CONFIRMED')::int AS sold,
      (SELECT count(*) FROM booking_seats bs JOIN bookings b ON b.id = bs."bookingId"
        WHERE b."eventId" = e.id AND b.status = 'PENDING' AND b."expiresAt" > ${now}::timestamp(3))::int AS held,
      (SELECT coalesce(sum(b."totalMinor"), 0) FROM bookings b
        WHERE b."eventId" = e.id AND b.status = 'CONFIRMED')::int AS "revenueMinor",
      (SELECT count(*) FROM bookings b WHERE b."eventId" = e.id AND b."checkedInAt" IS NOT NULL)::int AS "checkedIn"
    FROM events e
    WHERE e."organizationId" = ${organizationId}
    ORDER BY e."startsAt"`;
}

export async function findDashboardEvent(db: Db, organizationId: string, slug: string) {
  return db.event.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
    select: { id: true, slug: true, title: true, startsAt: true, status: true, currency: true },
  });
}

export type BookingFilter = { status?: BookingStatus; search?: string };

/**
 * The bookings of one event, newest first, optionally filtered by status (as customers
 * see it: a hold that ran out counts as expired) and by reference or name.
 */
export async function listEventBookings(
  db: Db,
  organizationId: string,
  eventId: string,
  filter: BookingFilter = {},
  now = new Date(),
) {
  const search = filter.search?.trim();
  const statusWhere: Record<BookingStatus, Prisma.BookingWhereInput> = {
    PENDING: { status: "PENDING", expiresAt: { gt: now } },
    EXPIRED: { OR: [{ status: "EXPIRED" }, staleHoldWhere(now)] },
    CONFIRMED: { status: "CONFIRMED" },
    CANCELLED: { status: "CANCELLED" },
    REFUNDED: { status: "REFUNDED" },
  };
  return db.booking.findMany({
    where: {
      organizationId,
      eventId,
      AND: [
        filter.status ? statusWhere[filter.status] : {},
        search
          ? {
              OR: [
                { reference: { startsWith: search.toUpperCase() } },
                { customerName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      reference: true,
      customerName: true,
      customerEmail: true,
      status: true,
      expiresAt: true,
      totalMinor: true,
      seatLabels: true,
      createdAt: true,
      paidAt: true,
      checkedInAt: true,
      checkedInBy: { select: { name: true } },
    },
  });
}

export type DashboardBooking = Awaited<ReturnType<typeof listEventBookings>>[number];

export async function findBookingForCheckIn(db: Db, organizationId: string, reference: string) {
  return db.booking.findUnique({
    where: { reference, organizationId },
    select: {
      reference: true,
      customerName: true,
      status: true,
      expiresAt: true,
      seatLabels: true,
      checkedInAt: true,
      checkedInBy: { select: { name: true } },
      event: { select: { title: true, startsAt: true } },
    },
  });
}

export type CheckInResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" | "NOT_CONFIRMED" }
  | { ok: false; code: "ALREADY_CHECKED_IN"; at: Date; by: string | null };

/**
 * Marks a confirmed booking as arrived. Conditional on "not checked in yet", so two
 * staff members scanning the same ticket at once cannot both let it in.
 */
export async function checkInBooking(
  db: Db,
  command: { organizationId: string; reference: string; userId: string },
  now = new Date(),
): Promise<CheckInResult> {
  const { count } = await db.booking.updateMany({
    where: {
      organizationId: command.organizationId,
      reference: command.reference,
      status: "CONFIRMED",
      checkedInAt: null,
    },
    data: { checkedInAt: now, checkedInById: command.userId },
  });
  if (count === 1) return { ok: true };

  const booking = await db.booking.findUnique({
    where: { reference: command.reference, organizationId: command.organizationId },
    select: { status: true, checkedInAt: true, checkedInBy: { select: { name: true } } },
  });
  if (!booking) return { ok: false, code: "NOT_FOUND" };
  if (booking.checkedInAt) {
    return { ok: false, code: "ALREADY_CHECKED_IN", at: booking.checkedInAt, by: booking.checkedInBy?.name ?? null };
  }
  return { ok: false, code: "NOT_CONFIRMED" };
}
