import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ManageCancelForm } from "@/components/manage-cancel-form";
import { getDictionary } from "@/i18n";
import { fill, localizePath } from "@/i18n/config";
import { isBookingReference } from "@/lib/booking-reference";
import { effectiveStatus } from "@/lib/booking-status";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { verifyManageToken } from "@/server/email/manage-link";
import { getOrganization } from "@/server/queries";
import { findBookingForManage } from "@/server/repositories/bookings";
import { cancelWithLinkAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.manage.metaTitle, robots: { index: false, follow: false } };
}

type Props = PageProps<"/[lang]/[org]/bookings/[reference]/manage">;

/** The page behind the "Manage or cancel your booking" link in the confirmation email. */
export default async function ManageBookingPage({ params, searchParams }: Props) {
  const { t } = await getDictionary();
  return (
    <Suspense fallback={<p className="text-muted">{t.booking.loading}</p>}>
      <ManageBooking params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ManageBooking({ params, searchParams }: Props) {
  const { org, reference } = await params;
  const { t: tokenParam } = await searchParams;
  const token = typeof tokenParam === "string" ? tokenParam : "";
  const organization = isBookingReference(reference) ? await getOrganization(org) : null;
  const booking = organization ? await findBookingForManage(db, organization.id, reference) : null;
  if (!organization || !booking) {
    notFound();
  }
  const { locale, t } = await getDictionary();
  const bookingPage = localizePath(locale, `/${organization.slug}/bookings/${booking.reference}`);
  const valid = verifyManageToken(token, { bookingId: booking.id, email: booking.customerEmail });
  const status = effectiveStatus(booking);
  const cancellable = (status === "CONFIRMED" || status === "PENDING") && booking.event.startsAt > new Date();

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">{t.manage.label}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{booking.event.title}</h1>
        <p className="text-muted">
          {formatEventDate(booking.event.startsAt, locale)} · {formatEventTime(booking.event.startsAt, locale)} ·{" "}
          {booking.reference}
        </p>
      </header>

      {!valid ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
          {t.manage.invalid}
        </p>
      ) : cancellable ? (
        <section aria-labelledby="cancel-heading" className="flex flex-col gap-3">
          <h2 id="cancel-heading" className="text-xl font-semibold">
            {fill(t.manage.cancelQuestion, { name: booking.customerName })}
          </h2>
          <ul className="text-sm">
            {booking.seatLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            {booking.paidAt
              ? fill(t.manage.refundNote, { amount: formatMoney(booking.totalMinor, booking.event.currency, locale) })
              : t.manage.releaseNote}
          </p>
          <ManageCancelForm
            action={cancelWithLinkAction.bind(null, organization.slug, booking.reference, token, locale)}
            t={{ submit: t.booking.cancelBooking, pending: t.booking.cancelling }}
          />
        </section>
      ) : (
        <p>{fill(t.manage.nothingToChange, { status: t.bookingStatus[status] })}</p>
      )}

      <Link href={bookingPage} className="text-sm text-accent hover:underline">
        {t.manage.goToBooking}
      </Link>
    </div>
  );
}
