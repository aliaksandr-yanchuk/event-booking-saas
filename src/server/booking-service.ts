import { createHash } from "node:crypto";
import type { BookingStatus } from "@/generated/prisma/client";
import { generateBookingReference } from "@/lib/booking-reference";
import type { BookingInput } from "@/lib/booking-input";
import { sumMinor } from "@/lib/money";
import { seatLabel } from "@/lib/seats";
import type { Db } from "@/server/db";
import { isUniqueViolation } from "@/server/db-errors";
import { activeSeatWhere, releaseStaleHolds } from "@/server/holds";
import { confirmPayment } from "@/server/payment-service";
import { HOLD_TTL_MS, type PaymentProvider } from "@/server/payments/provider";

export type CreateBookingCommand = BookingInput & {
  organizationId: string;
  eventId: string;
  // Client-chosen key that makes retries safe: see IdempotencyKey in schema.prisma.
  idempotencyKey?: string;
};

export type CreateBookingResult =
  // A paid booking starts PENDING and holds its seats until expiresAt; a free one is
  // CONFIRMED right away. replayed: the key was already used for this exact request,
  // and this is that booking (in whatever state it is now).
  | {
      ok: true;
      reference: string;
      totalMinor: number;
      status: BookingStatus;
      expiresAt: Date | null;
      replayed: boolean;
    }
  // The key was already used for a different request (other seats, customer or event).
  | { ok: false; code: "IDEMPOTENCY_KEY_REUSED" }
  | { ok: false; code: "EVENT_NOT_BOOKABLE" }
  | { ok: false; code: "TOO_MANY_SEATS"; limit: number }
  | { ok: false; code: "INVALID_SEATS" }
  // takenSeatIds lets the form mark exactly which seats were lost to someone else.
  | { ok: false; code: "SEATS_TAKEN"; takenSeatIds: string[] };

/**
 * Books seats atomically. Paid bookings start as a hold (PENDING) that the payment
 * confirms; see payment-service.ts.
 *
 * Correctness under concurrency does not depend on the "is it free?" check:
 * booking_seats.seat_id is UNIQUE, so if two transactions pass the check at the
 * same moment, PostgreSQL rejects the second INSERT and its transaction rolls back.
 *
 * With an idempotency key, a retry of a request that already succeeded (say, after a
 * timeout) returns the original booking. Without the key, the same retry would fail
 * with SEATS_TAKEN: the customer's own first attempt holds the seats.
 */
export async function createBooking(
  db: Db,
  command: CreateBookingCommand,
  options: { now?: Date; generateReference?: () => string } = {},
): Promise<CreateBookingResult> {
  const now = options.now ?? new Date();
  const generateReference = options.generateReference ?? generateBookingReference;
  const idempotency = command.idempotencyKey
    ? { organizationId: command.organizationId, key: command.idempotencyKey, requestHash: hashRequest(command) }
    : undefined;

  // Checked first: a retry must return the booking even if the event has started since.
  if (idempotency) {
    const previous = await findIdempotentBooking(db, idempotency);
    if (previous) return previous;
  }

  const event = await db.event.findFirst({
    where: { id: command.eventId, organizationId: command.organizationId },
    select: { id: true, status: true, startsAt: true, maxSeatsPerBooking: true },
  });
  if (!event || event.status !== "PUBLISHED" || event.startsAt <= now) {
    return { ok: false, code: "EVENT_NOT_BOOKABLE" };
  }
  if (command.seatIds.length > event.maxSeatsPerBooking) {
    return { ok: false, code: "TOO_MANY_SEATS", limit: event.maxSeatsPerBooking };
  }

  // Scoped to this event, so seat IDs from another event (or tenant) are rejected.
  const seats = await db.seat.findMany({
    where: { id: { in: command.seatIds }, eventId: event.id },
    select: {
      id: true,
      row: true,
      number: true,
      section: { select: { name: true, priceMinor: true } },
      // An expired hold does not make a seat taken; it is released below.
      bookingSeats: { where: activeSeatWhere(now), select: { seatId: true } },
    },
  });
  if (seats.length !== command.seatIds.length) {
    return { ok: false, code: "INVALID_SEATS" };
  }

  const alreadyTaken = seats.filter((seat) => seat.bookingSeats.length > 0).map((seat) => seat.id);
  if (alreadyTaken.length > 0) {
    // A request with the same key may have committed since the check at the top; then
    // the seats are taken by this very booking, and it is a retry, not a conflict.
    if (idempotency) {
      const previous = await findIdempotentBooking(db, idempotency);
      if (previous) return previous;
    }
    return { ok: false, code: "SEATS_TAKEN", takenSeatIds: alreadyTaken };
  }

  const totalMinor = sumMinor(seats.map((seat) => seat.section.priceMinor));
  const reference = generateReference();
  const status: BookingStatus = totalMinor > 0 ? "PENDING" : "CONFIRMED";
  const expiresAt = status === "PENDING" ? new Date(now.getTime() + HOLD_TTL_MS) : null;

  try {
    await db.$transaction(async (tx) => {
      // Expired holds still own their seat rows; free them so the INSERT below can succeed.
      await releaseStaleHolds(tx, command.seatIds, now);
      const booking = await tx.booking.create({
        data: {
          organizationId: command.organizationId,
          eventId: event.id,
          reference,
          customerName: command.customerName,
          customerEmail: command.customerEmail,
          totalMinor,
          status,
          expiresAt,
          seatLabels: seats.map((seat) =>
            seatLabel({ sectionName: seat.section.name, row: seat.row, number: seat.number }),
          ),
          seatIds: seats.map((seat) => seat.id),
        },
        select: { id: true },
      });
      await tx.bookingSeat.createMany({
        data: seats.map((seat) => ({ bookingId: booking.id, seatId: seat.id })),
      });
      if (idempotency) {
        await tx.idempotencyKey.create({ data: { ...idempotency, bookingId: booking.id } });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Two requests with the same key raced, and the other one won. Depending on which
      // INSERT failed first, the error is about the seats or about the key, so check the key.
      if (idempotency) {
        const previous = await findIdempotentBooking(db, idempotency);
        if (previous) return previous;
      }
      // Lost the race: find out which of the requested seats are now held.
      const taken = await db.bookingSeat.findMany({
        where: { seatId: { in: command.seatIds } },
        select: { seatId: true },
      });
      return { ok: false, code: "SEATS_TAKEN", takenSeatIds: taken.map((row) => row.seatId) };
    }
    throw error;
  }

  return { ok: true, reference, totalMinor, status, expiresAt, replayed: false };
}

/** The booking an earlier request with the same key made, or null if the key is new. */
async function findIdempotentBooking(
  db: Db,
  { organizationId, key, requestHash }: { organizationId: string; key: string; requestHash: string },
): Promise<CreateBookingResult | null> {
  const previous = await db.idempotencyKey.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: {
      requestHash: true,
      booking: { select: { reference: true, totalMinor: true, status: true, expiresAt: true } },
    },
  });
  if (!previous) return null;
  if (previous.requestHash !== requestHash) return { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
  return { ok: true, ...previous.booking, replayed: true };
}

/** Fingerprint of what is being booked. Seat order does not change the request, so it is sorted. */
function hashRequest(command: CreateBookingCommand): string {
  const canonical = JSON.stringify([
    command.eventId,
    command.customerName,
    command.customerEmail,
    [...command.seatIds].sort(),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export type CancelBookingResult =
  // eventId lets callers invalidate that event's cached availability.
  | { ok: true; eventId: string; refunded: boolean }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_CANCELLED" | "EVENT_STARTED" };

/**
 * Cancels a booking and releases its seats: a hold before payment, or a confirmed
 * booking (refunded if it was paid). The customer's email works as a second factor
 * next to the reference, so a leaked URL alone cannot cancel it.
 *
 * The provider calls happen before the database update and outside any transaction,
 * so no row lock is held during a network call. Both calls are safe to repeat: the
 * refund has an idempotency key, and expiring a checkout twice is harmless.
 */
export async function cancelBooking(
  db: Db,
  payments: PaymentProvider,
  command: { organizationId: string; reference: string; customerEmail: string },
  options: { now?: Date } = {},
): Promise<CancelBookingResult> {
  const now = options.now ?? new Date();

  const booking = await db.booking.findFirst({
    where: {
      organizationId: command.organizationId,
      reference: command.reference,
      customerEmail: command.customerEmail.trim().toLowerCase(),
    },
    select: {
      id: true,
      eventId: true,
      status: true,
      checkoutSessionId: true,
      paymentId: true,
      event: { select: { startsAt: true } },
    },
  });
  if (!booking) return { ok: false, code: "NOT_FOUND" };
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") return { ok: false, code: "ALREADY_CANCELLED" };
  if (booking.event.startsAt <= now) return { ok: false, code: "EVENT_STARTED" };

  if (booking.status === "PENDING" && booking.checkoutSessionId) {
    // Otherwise the customer could still pay for seats they just released.
    const expired = await payments.expireCheckout(booking.checkoutSessionId);
    if (expired.completed) {
      // They paid a moment ago. Record the payment, then cancel the now confirmed
      // booking, which refunds it.
      await confirmPayment(db, payments, { sessionId: booking.checkoutSessionId, paymentId: expired.paymentId });
      return cancelBooking(db, payments, command, options);
    }
  }
  const refund = booking.status === "CONFIRMED" && booking.paymentId !== null;
  if (refund) {
    await payments.refund(booking.paymentId!, { idempotencyKey: `refund-${booking.id}` });
  }

  const cancelled = await db.$transaction(async (tx) => {
    // The status condition makes a concurrent second cancel (or a payment that confirmed
    // the hold meanwhile) visible: then nothing is updated.
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, status: booking.status },
      data: { status: "CANCELLED", cancelledAt: now, ...(refund && { refundedAt: now }) },
    });
    if (count === 1) {
      await tx.bookingSeat.deleteMany({ where: { bookingId: booking.id } });
    }
    return count === 1;
  });
  if (!cancelled) {
    // The booking changed state meanwhile (cancelled elsewhere, or a hold that got paid).
    // Start over from the new state; states only move forward, so this ends.
    return cancelBooking(db, payments, command, options);
  }
  return { ok: true, eventId: booking.eventId, refunded: refund };
}
