import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CancelBookingForm } from "@/components/cancel-booking-form";
import { isBookingReference } from "@/lib/booking-reference";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { findBookingByReference } from "@/server/repositories/bookings";
import { getOrganization } from "@/server/queries";
import { cancelBookingAction } from "./actions";

// Booking pages are private: keep them out of search results.
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/[org]/bookings/[reference]">;

export default function BookingPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="text-muted">Loading your booking…</p>}>
      <BookingDetails params={params} />
    </Suspense>
  );
}

async function BookingDetails({ params }: Pick<Props, "params">) {
  const { org, reference } = await params;
  if (!isBookingReference(reference)) {
    notFound();
  }
  const organization = await getOrganization(org);
  // Never cached: the status changes when the customer cancels.
  const booking = organization ? await findBookingByReference(db, organization.id, reference) : null;
  if (!organization || !booking) {
    notFound();
  }

  const cancelled = booking.status === "CANCELLED";

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className={`text-sm font-medium uppercase tracking-wide ${cancelled ? "text-danger" : "text-accent"}`}>
          {cancelled ? "Booking cancelled" : "Booking confirmed"}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{booking.event.title}</h1>
        <p className="text-muted">
          <time dateTime={booking.event.startsAt.toISOString()}>
            {formatEventDate(booking.event.startsAt)} · {formatEventTime(booking.event.startsAt)}
          </time>{" "}
          · {booking.event.venue.name}, {booking.event.venue.city}
        </p>
      </header>

      <dl className="grid gap-x-8 gap-y-3 rounded-xl border border-border bg-surface p-5 sm:grid-cols-[auto_1fr]">
        <dt className="text-sm text-muted">Reference</dt>
        <dd className="font-mono text-lg" data-testid="booking-reference">
          {booking.reference}
        </dd>
        <dt className="text-sm text-muted">Name</dt>
        <dd>{booking.customerName}</dd>
        <dt className="text-sm text-muted">Seats</dt>
        <dd>
          <ul>
            {booking.seatLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </dd>
        <dt className="text-sm text-muted">Total</dt>
        <dd className="font-medium">{formatMoney(booking.totalMinor, booking.event.currency)}</dd>
      </dl>

      {cancelled ? (
        <p>Your seats have been released.</p>
      ) : (
        <section aria-labelledby="cancel-heading" className="flex flex-col gap-3">
          <h2 id="cancel-heading" className="text-xl font-semibold">
            Can&apos;t make it?
          </h2>
          <p className="text-sm text-muted">Cancel before the event starts and your seats go back on sale.</p>
          <CancelBookingForm
            action={cancelBookingAction.bind(null, organization.slug, booking.reference, booking.eventId)}
          />
        </section>
      )}

      <Link href={`/${organization.slug}/events/${booking.event.slug}`} className="text-sm text-accent hover:underline">
        ← Back to the event
      </Link>
    </div>
  );
}
