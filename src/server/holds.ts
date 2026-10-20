import type { Prisma } from "@/generated/prisma/client";

/**
 * Seat holds. A PENDING booking (awaiting payment) owns booking_seats rows like a
 * confirmed one, so the UNIQUE constraint on seat_id protects held seats exactly as it
 * protects sold ones. When a hold runs out, its rows still exist until something
 * releases them; until then, they must not count as taken.
 *
 * Holds are released lazily: by the next booking that wants one of the seats (inside
 * its transaction), by Stripe's checkout.session.expired webhook, or when the customer
 * cancels. No background job is needed for correctness.
 */

/** booking_seats rows that really hold their seat: sold, or held and not yet expired. */
export function activeSeatWhere(now: Date): Prisma.BookingSeatWhereInput {
  return { booking: { OR: [{ status: { not: "PENDING" } }, { expiresAt: { gt: now } }] } };
}

/** Bookings whose hold has run out but still own their seats. */
export function staleHoldWhere(now: Date): Prisma.BookingWhereInput {
  return { status: "PENDING", expiresAt: { lte: now } };
}

/**
 * Marks expired holds on these seats as EXPIRED and deletes their seat rows, inside the
 * caller's transaction. Two transactions may try this for the same booking: the
 * status condition makes the second UPDATE a no-op once the first commits.
 */
export async function releaseStaleHolds(tx: Prisma.TransactionClient, seatIds: string[], now: Date) {
  const stale = await tx.booking.findMany({
    where: { ...staleHoldWhere(now), seats: { some: { seatId: { in: seatIds } } } },
    select: { id: true },
  });
  if (stale.length === 0) {
    return;
  }
  const ids = stale.map((booking) => booking.id);
  await tx.booking.updateMany({ where: { id: { in: ids }, ...staleHoldWhere(now) }, data: { status: "EXPIRED" } });
  await tx.bookingSeat.deleteMany({ where: { bookingId: { in: ids }, booking: { status: "EXPIRED" } } });
}
