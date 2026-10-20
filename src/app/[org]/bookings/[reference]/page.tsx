import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CancelBookingForm } from "@/components/cancel-booking-form";
import { buttonClasses } from "@/components/ui/button";
import { isBookingReference } from "@/lib/booking-reference";
import { effectiveStatus, type BookingStatusValue } from "@/lib/booking-status";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { findBookingByReference } from "@/server/repositories/bookings";
import { getOrganization } from "@/server/queries";
import { cancelBookingAction, continueToPaymentAction } from "./actions";

// Booking pages are private: keep them out of search results.
export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/[org]/bookings/[reference]">;

const STATUS_HEADINGS: Record<BookingStatusValue, { label: string; tone: string }> = {
  PENDING: { label: "Awaiting payment", tone: "text-foreground" },
  CONFIRMED: { label: "Booking confirmed", tone: "text-accent" },
  CANCELLED: { label: "Booking cancelled", tone: "text-danger" },
  EXPIRED: { label: "Hold expired", tone: "text-danger" },
  REFUNDED: { label: "Payment refunded", tone: "text-danger" },
};

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

  const status = effectiveStatus(booking);
  const heading = STATUS_HEADINGS[status];

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className={`text-sm font-medium tracking-wide uppercase ${heading.tone}`}>{heading.label}</p>
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

      {status === "PENDING" && (
        <section aria-labelledby="payment-heading" className="flex flex-col gap-3">
          <h2 id="payment-heading" className="text-xl font-semibold">
            Complete your payment
          </h2>
          <p className="text-sm text-muted">
            Your seats are held until{" "}
            <time dateTime={booking.expiresAt!.toISOString()}>{formatEventTime(booking.expiresAt!)}</time>. Pay before
            then to confirm the booking.
          </p>
          <form action={continueToPaymentAction.bind(null, organization.slug, booking.reference)}>
            <button type="submit" className={buttonClasses("primary")}>
              Continue to payment
            </button>
          </form>
        </section>
      )}

      {(status === "PENDING" || status === "CONFIRMED") && (
        <section aria-labelledby="cancel-heading" className="flex flex-col gap-3">
          <h2 id="cancel-heading" className="text-xl font-semibold">
            {status === "PENDING" ? "Changed your mind?" : "Can't make it?"}
          </h2>
          <p className="text-sm text-muted">
            {status === "PENDING"
              ? "Release the seats now so others can book them. You have not been charged."
              : booking.paidAt
                ? "Cancel before the event starts for a full refund. Your seats go back on sale."
                : "Cancel before the event starts and your seats go back on sale."}
          </p>
          <CancelBookingForm
            action={cancelBookingAction.bind(null, organization.slug, booking.reference)}
            submitLabel={status === "PENDING" ? "Release seats" : "Cancel booking"}
          />
        </section>
      )}

      {status === "CANCELLED" && (
        <p>
          Your seats have been released.
          {booking.refundedAt && " Your payment has been refunded in full."}
        </p>
      )}
      {status === "EXPIRED" && (
        <p>The hold on these seats ran out before payment, and they were released. You have not been charged.</p>
      )}
      {status === "REFUNDED" && (
        <p>
          Your payment arrived after the hold had run out, and another customer had booked some of the seats by then.
          The full amount has been refunded.
        </p>
      )}

      <Link href={`/${organization.slug}/events/${booking.event.slug}`} className="text-sm text-accent hover:underline">
        ← Back to the event
      </Link>
    </div>
  );
}
