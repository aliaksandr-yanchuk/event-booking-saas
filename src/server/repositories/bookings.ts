import type { Db } from "@/server/db";

export async function findBookingByReference(db: Db, organizationId: string, reference: string) {
  return db.booking.findFirst({
    where: { organizationId, reference },
    // The email is deliberately not selected: anyone with the link can see this page.
    select: {
      reference: true,
      eventId: true,
      customerName: true,
      status: true,
      totalMinor: true,
      seatLabels: true,
      createdAt: true,
      cancelledAt: true,
      event: {
        select: {
          slug: true,
          title: true,
          startsAt: true,
          currency: true,
          venue: { select: { name: true, city: true } },
        },
      },
    },
  });
}

export type BookingDetails = NonNullable<Awaited<ReturnType<typeof findBookingByReference>>>;
