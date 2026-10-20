import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CancelBookingForm } from "@/components/cancel-booking-form";
import { DemoInbox } from "@/components/demo-inbox";
import { TicketQr } from "@/components/ticket-qr";
import { buttonClasses } from "@/components/ui/button";
import { getDictionary } from "@/i18n";
import { fill, localizePath } from "@/i18n/config";
import { isBookingReference } from "@/lib/booking-reference";
import { effectiveStatus, type BookingStatusValue } from "@/lib/booking-status";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { absoluteUrl } from "@/lib/site";
import { db } from "@/server/db";
import { getEmailSender } from "@/server/email/sender";
import { findBookingByReference } from "@/server/repositories/bookings";
import { getOrganization } from "@/server/queries";
import { cancelBookingAction, continueToPaymentAction, readDemoInboxAction } from "./actions";

// Booking pages are private: keep them out of search results.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.booking.metaTitle, robots: { index: false, follow: false } };
}

type Props = PageProps<"/[lang]/[org]/bookings/[reference]">;

const STATUS_TONES: Record<BookingStatusValue, string> = {
  PENDING: "text-foreground",
  CONFIRMED: "text-accent",
  CANCELLED: "text-danger",
  EXPIRED: "text-danger",
  REFUNDED: "text-danger",
};

export default async function BookingPage({ params }: Props) {
  const { t } = await getDictionary();
  return (
    <Suspense fallback={<p className="text-muted">{t.booking.loading}</p>}>
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

  const { locale, t } = await getDictionary();
  const status = effectiveStatus(booking);

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className={`text-sm font-medium tracking-wide uppercase ${STATUS_TONES[status]}`}>
          {t.booking.headings[status]}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{booking.event.title}</h1>
        <p className="text-muted">
          <time dateTime={booking.event.startsAt.toISOString()}>
            {formatEventDate(booking.event.startsAt, locale)} · {formatEventTime(booking.event.startsAt, locale)}
          </time>{" "}
          · {booking.event.venue.name}, {booking.event.venue.city}
        </p>
      </header>

      <dl className="grid gap-x-8 gap-y-3 rounded-xl border border-border bg-surface p-5 sm:grid-cols-[auto_1fr]">
        <dt className="text-sm text-muted">{t.booking.reference}</dt>
        <dd className="font-mono text-lg" data-testid="booking-reference">
          {booking.reference}
        </dd>
        <dt className="text-sm text-muted">{t.booking.name}</dt>
        <dd>{booking.customerName}</dd>
        <dt className="text-sm text-muted">{t.booking.seats}</dt>
        <dd>
          <ul>
            {booking.seatLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </dd>
        <dt className="text-sm text-muted">{t.booking.total}</dt>
        <dd className="font-medium">{formatMoney(booking.totalMinor, booking.event.currency, locale)}</dd>
      </dl>

      {status === "PENDING" && (
        <section aria-labelledby="payment-heading" className="flex flex-col gap-3">
          <h2 id="payment-heading" className="text-xl font-semibold">
            {t.booking.completePayment}
          </h2>
          <p className="text-sm text-muted">
            {fill(t.booking.heldUntil, { time: formatEventTime(booking.expiresAt!, locale) })}
          </p>
          <form action={continueToPaymentAction.bind(null, organization.slug, booking.reference, locale)}>
            <button type="submit" className={buttonClasses("primary")}>
              {t.booking.continueToPayment}
            </button>
          </form>
        </section>
      )}

      {status === "CONFIRMED" && (
        <section aria-labelledby="ticket-heading" className="flex flex-col items-start gap-3">
          <h2 id="ticket-heading" className="text-xl font-semibold">
            {t.booking.ticket}
          </h2>
          <p className="text-sm text-muted">{t.booking.ticketHint}</p>
          {/* For the staff's phone: the dashboard in its default language (staff can switch). */}
          <TicketQr
            url={absoluteUrl(`/dashboard/${organization.slug}/check-in?ref=${booking.reference}`)}
            label={fill(t.booking.ticketQr, { reference: booking.reference })}
          />
          {booking.checkedInAt && <p className="text-sm font-medium">{t.booking.checkedIn}</p>}
        </section>
      )}

      {(status === "PENDING" || status === "CONFIRMED") && (
        <section aria-labelledby="cancel-heading" className="flex flex-col gap-3">
          <h2 id="cancel-heading" className="text-xl font-semibold">
            {status === "PENDING" ? t.booking.changedMind : t.booking.cantMakeIt}
          </h2>
          <p className="text-sm text-muted">
            {status === "PENDING"
              ? t.booking.releaseHint
              : booking.paidAt
                ? t.booking.refundHint
                : t.booking.cancelHint}
          </p>
          <CancelBookingForm
            action={cancelBookingAction.bind(null, organization.slug, booking.reference, locale)}
            t={{
              emailLabel: t.booking.emailLabel,
              submit: status === "PENDING" ? t.booking.releaseSeats : t.booking.cancelBooking,
              pending: t.booking.cancelling,
            }}
          />
        </section>
      )}

      {status === "CANCELLED" && (
        <p>
          {t.booking.released}
          {booking.refundedAt && t.booking.refundedInFull}
        </p>
      )}
      {status === "EXPIRED" && <p>{t.booking.expired}</p>}
      {status === "REFUNDED" && <p>{t.booking.refunded}</p>}

      {status !== "PENDING" && status !== "EXPIRED" && getEmailSender().name === "demo" && (
        <section aria-labelledby="inbox-heading" className="flex flex-col gap-3">
          <h2 id="inbox-heading" className="text-xl font-semibold">
            {t.booking.inbox}
          </h2>
          <p className="text-sm text-muted">{t.booking.inboxHint}</p>
          <DemoInbox
            action={readDemoInboxAction.bind(null, organization.slug, booking.reference, locale)}
            t={{
              email: t.booking.inboxEmail,
              open: t.booking.openInbox,
              refresh: t.booking.refreshInbox,
              opening: t.booking.opening,
              empty: t.booking.inboxEmpty,
              list: t.booking.inboxList,
            }}
          />
        </section>
      )}

      <Link
        href={localizePath(locale, `/${organization.slug}/events/${booking.event.slug}`)}
        className="text-sm text-accent hover:underline"
      >
        {t.booking.backToEvent}
      </Link>
    </div>
  );
}
