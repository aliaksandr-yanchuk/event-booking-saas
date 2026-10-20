import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { getDictionary } from "@/i18n";
import { fill, localizePath, plural, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { effectiveStatus, isBookingStatus } from "@/lib/booking-status";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireMembership } from "@/server/auth/dal";
import { db } from "@/server/db";
import { findDashboardEvent, listEventBookings, type DashboardBooking } from "@/server/repositories/dashboard";
import { checkInAction } from "../../actions";
import { DashboardHeader } from "../../../dashboard-header";

type Props = PageProps<"/[lang]/dashboard/[org]/events/[event]">;

export default async function EventBookingsPage({ params, searchParams }: Props) {
  const { t } = await getDictionary();
  return (
    <Suspense fallback={<p className="text-muted">{t.dashboard.loadingBookings}</p>}>
      <EventBookings params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EventBookings({ params, searchParams }: Props) {
  const { org, event: eventSlug } = await params;
  const query = await searchParams;
  const { locale, t: dict } = await getDictionary();
  const t = dict.dashboard;
  const membership = await requireMembership(org, localizePath(locale, `/dashboard/${org}/events/${eventSlug}`));
  const event = await findDashboardEvent(db, membership.organization.id, eventSlug);
  if (!event) {
    notFound();
  }

  const status = isBookingStatus(query.status) ? query.status : undefined;
  const search = typeof query.q === "string" ? query.q.slice(0, 60) : "";
  const bookings = await listEventBookings(db, membership.organization.id, event.id, { status, search });
  const { isOwner } = membership;

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader membership={membership} locale={locale} t={t} />
      <header className="flex flex-col gap-1">
        <Link
          href={localizePath(locale, `/dashboard/${org}`)}
          className="text-sm font-medium text-accent hover:underline"
        >
          {t.allEvents}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
        <p className="text-muted">
          {formatEventDate(event.startsAt, locale)} · {formatEventTime(event.startsAt, locale)}
        </p>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* A GET form: filters live in the URL, so a filtered list can be shared or reloaded. */}
        <form className="flex flex-wrap items-end gap-3" role="search" aria-label={t.filterLabel}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t.status}
            <select
              name="status"
              defaultValue={status ?? ""}
              className="rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <option value="">{t.all}</option>
              {Object.entries(dict.bookingStatus).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t.search}
            <input
              type="search"
              name="q"
              defaultValue={search}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
            />
          </label>
          <button type="submit" className={buttonClasses("secondary")}>
            {t.filter}
          </button>
        </form>
        {isOwner && (
          // A file download, not a page: a plain link, so Next.js does not try to prefetch it.
          <a
            href={localizePath(locale, `/dashboard/${org}/events/${event.slug}/bookings.csv`)}
            className={buttonClasses("secondary")}
            download
          >
            {t.exportCsv}
          </a>
        )}
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {plural(t.bookingCount, bookings.length)}
      </p>

      <div
        className="overflow-x-auto rounded-xl border border-border"
        tabIndex={0}
        role="region"
        aria-label={t.bookingsRegion}
      >
        <table className="w-full min-w-3xl text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t.columns.booking}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t.columns.seats}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t.columns.status}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t.columns.total}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t.columns.door}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bookings.map((booking) => (
              <BookingRow
                key={booking.reference}
                booking={booking}
                currency={event.currency}
                showEmail={isOwner}
                locale={locale}
                t={dict}
                checkIn={checkInAction.bind(null, org, booking.reference, locale)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BookingRow({
  booking,
  currency,
  showEmail,
  locale,
  t,
  checkIn,
}: {
  booking: DashboardBooking;
  currency: string;
  showEmail: boolean;
  locale: Locale;
  t: Dictionary;
  checkIn: () => Promise<void>;
}) {
  const status = effectiveStatus(booking);
  return (
    <tr>
      <td className="px-4 py-3">
        <span className="font-mono">{booking.reference}</span>
        <span className="block">{booking.customerName}</span>
        {/* Door staff do not need customers' email addresses. */}
        {showEmail && <span className="block text-muted">{booking.customerEmail}</span>}
      </td>
      <td className="px-4 py-3">
        <ul>
          {booking.seatLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </td>
      <td className="px-4 py-3">{t.bookingStatus[status]}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(booking.totalMinor, currency, locale)}</td>
      <td className="px-4 py-3">
        {booking.checkedInAt ? (
          <span>
            {fill(t.dashboard.checkedInAt, { time: formatEventTime(booking.checkedInAt, locale) })}
            {booking.checkedInBy && (
              <span className="block text-muted">{fill(t.dashboard.by, { name: booking.checkedInBy.name })}</span>
            )}
          </span>
        ) : status === "CONFIRMED" ? (
          <form action={checkIn}>
            <button
              type="submit"
              className={buttonClasses("secondary")}
              aria-label={fill(t.dashboard.checkInAria, { name: booking.customerName, reference: booking.reference })}
            >
              {t.dashboard.checkInButton}
            </button>
          </form>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
}
