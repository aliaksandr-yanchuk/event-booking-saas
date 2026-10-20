import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ManageCancelForm } from "@/components/manage-cancel-form";
import { isBookingReference } from "@/lib/booking-reference";
import { effectiveStatus } from "@/lib/booking-status";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { verifyManageToken } from "@/server/email/manage-link";
import { getOrganization } from "@/server/queries";
import { findBookingForManage } from "@/server/repositories/bookings";
import { cancelWithLinkAction } from "../actions";

export const metadata: Metadata = {
  title: "Manage your booking",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/[org]/bookings/[reference]/manage">;

/** The page behind the "Manage or cancel your booking" link in the confirmation email. */
export default function ManageBookingPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="text-muted">Loading your booking…</p>}>
      <ManageBooking params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ManageBooking({ params, searchParams }: Props) {
  const { org, reference } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const organization = isBookingReference(reference) ? await getOrganization(org) : null;
  const booking = organization ? await findBookingForManage(db, organization.id, reference) : null;
  if (!organization || !booking) {
    notFound();
  }
  const bookingPage = `/${organization.slug}/bookings/${booking.reference}`;
  const valid = verifyManageToken(token, { bookingId: booking.id, email: booking.customerEmail });
  const status = effectiveStatus(booking);
  const cancellable = (status === "CONFIRMED" || status === "PENDING") && booking.event.startsAt > new Date();

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Manage your booking</p>
        <h1 className="text-3xl font-semibold tracking-tight">{booking.event.title}</h1>
        <p className="text-muted">
          {formatEventDate(booking.event.startsAt)} · {formatEventTime(booking.event.startsAt)} · {booking.reference}
        </p>
      </header>

      {!valid ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
          This link is no longer valid. You can still cancel on your booking page with the email you booked with.
        </p>
      ) : cancellable ? (
        <section aria-labelledby="cancel-heading" className="flex flex-col gap-3">
          <h2 id="cancel-heading" className="text-xl font-semibold">
            Cancel {booking.customerName}&apos;s booking?
          </h2>
          <ul className="text-sm">
            {booking.seatLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            {booking.paidAt
              ? `You will get a full refund of ${formatMoney(booking.totalMinor, booking.event.currency)}.`
              : "Your seats will be released."}
          </p>
          <ManageCancelForm action={cancelWithLinkAction.bind(null, organization.slug, booking.reference, token)} />
        </section>
      ) : (
        <p>There is nothing to change: this booking is {status.toLowerCase()} or the event has started.</p>
      )}

      <Link href={bookingPage} className="text-sm text-accent hover:underline">
        Go to your booking
      </Link>
    </div>
  );
}
