import { Prisma } from "@/generated/prisma/client";
import { generateBookingReference } from "@/lib/booking-reference";
import type { BookingInput } from "@/lib/booking-input";
import { sumMinor } from "@/lib/money";
import { seatLabel } from "@/lib/seats";
import type { Db } from "@/server/db";

export type CreateBookingCommand = BookingInput & {
  organizationId: string;
  eventId: string;
};

export type CreateBookingResult =
  | { ok: true; reference: string; totalMinor: number }
  | { ok: false; code: "EVENT_NOT_BOOKABLE" }
  | { ok: false; code: "TOO_MANY_SEATS"; limit: number }
  | { ok: false; code: "INVALID_SEATS" }
  // takenSeatIds lets the form mark exactly which seats were lost to someone else.
  | { ok: false; code: "SEATS_TAKEN"; takenSeatIds: string[] };

/**
 * Books seats atomically.
 *
 * Correctness under concurrency does not depend on the "is it free?" check:
 * booking_seats.seat_id is UNIQUE, so if two transactions pass the check at the
 * same moment, PostgreSQL rejects the second INSERT and its transaction rolls back.
 */
export async function createBooking(
  db: Db,
  command: CreateBookingCommand,
  options: { now?: Date; generateReference?: () => string } = {},
): Promise<CreateBookingResult> {
  const now = options.now ?? new Date();
  const generateReference = options.generateReference ?? generateBookingReference;

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
      bookingSeats: { select: { seatId: true } },
    },
  });
  if (seats.length !== command.seatIds.length) {
    return { ok: false, code: "INVALID_SEATS" };
  }

  const alreadyTaken = seats.filter((seat) => seat.bookingSeats.length > 0).map((seat) => seat.id);
  if (alreadyTaken.length > 0) {
    return { ok: false, code: "SEATS_TAKEN", takenSeatIds: alreadyTaken };
  }

  const totalMinor = sumMinor(seats.map((seat) => seat.section.priceMinor));
  const reference = generateReference();

  try {
    await db.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          organizationId: command.organizationId,
          eventId: event.id,
          reference,
          customerName: command.customerName,
          customerEmail: command.customerEmail,
          totalMinor,
          seatLabels: seats.map((seat) =>
            seatLabel({ sectionName: seat.section.name, row: seat.row, number: seat.number }),
          ),
        },
        select: { id: true },
      });
      await tx.bookingSeat.createMany({
        data: seats.map((seat) => ({ bookingId: booking.id, seatId: seat.id })),
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Lost the race: find out which of the requested seats are now held.
      const taken = await db.bookingSeat.findMany({
        where: { seatId: { in: command.seatIds } },
        select: { seatId: true },
      });
      return { ok: false, code: "SEATS_TAKEN", takenSeatIds: taken.map((row) => row.seatId) };
    }
    throw error;
  }

  return { ok: true, reference, totalMinor };
}

export type CancelBookingResult =
  // eventId lets callers invalidate that event's cached availability.
  | { ok: true; eventId: string }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_CANCELLED" | "EVENT_STARTED" };

/**
 * Cancels a booking and releases its seats. The customer's email works as a
 * second factor next to the reference, so a leaked URL alone cannot cancel it.
 */
export async function cancelBooking(
  db: Db,
  command: { organizationId: string; reference: string; customerEmail: string },
  options: { now?: Date } = {},
): Promise<CancelBookingResult> {
  const now = options.now ?? new Date();

  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: {
        organizationId: command.organizationId,
        reference: command.reference,
        customerEmail: command.customerEmail.trim().toLowerCase(),
      },
      select: { id: true, eventId: true, status: true, event: { select: { startsAt: true } } },
    });
    if (!booking) return { ok: false, code: "NOT_FOUND" };
    if (booking.status === "CANCELLED") return { ok: false, code: "ALREADY_CANCELLED" };
    if (booking.event.startsAt <= now) return { ok: false, code: "EVENT_STARTED" };

    await tx.bookingSeat.deleteMany({ where: { bookingId: booking.id } });
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    return { ok: true, eventId: booking.eventId };
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
