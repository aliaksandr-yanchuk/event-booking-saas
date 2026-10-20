import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { BOOKING_STATUS_LABELS, effectiveStatus, isBookingStatus } from "@/lib/booking-status";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireMembership } from "@/server/auth/dal";
import { db } from "@/server/db";
import { findDashboardEvent, listEventBookings, type DashboardBooking } from "@/server/repositories/dashboard";
import { checkInAction } from "../../actions";
import { DashboardHeader } from "../../../dashboard-header";

type Props = PageProps<"/dashboard/[org]/events/[event]">;

export default function EventBookingsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="text-muted">Loading bookings…</p>}>
      <EventBookings params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EventBookings({ params, searchParams }: Props) {
  const { org, event: eventSlug } = await params;
  const query = await searchParams;
  const membership = await requireMembership(org, `/dashboard/${org}/events/${eventSlug}`);
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
      <DashboardHeader membership={membership} />
      <header className="flex flex-col gap-1">
        <Link href={`/dashboard/${org}`} className="text-sm font-medium text-accent hover:underline">
          ← All events
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
        <p className="text-muted">
          {formatEventDate(event.startsAt)} · {formatEventTime(event.startsAt)}
        </p>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-4">
        {/* A GET form: filters live in the URL, so a filtered list can be shared or reloaded. */}
        <form className="flex flex-wrap items-end gap-3" role="search" aria-label="Filter bookings">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Status
            <select
              name="status"
              defaultValue={status ?? ""}
              className="rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <option value="">All</option>
              {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name or reference
            <input
              type="search"
              name="q"
              defaultValue={search}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
            />
          </label>
          <button type="submit" className={buttonClasses("secondary")}>
            Filter
          </button>
        </form>
        {isOwner && (
          // A file download, not a page: a plain link, so Next.js does not try to prefetch it.
          <a
            href={`/dashboard/${org}/events/${event.slug}/bookings.csv`}
            className={buttonClasses("secondary")}
            download
          >
            Export CSV
          </a>
        )}
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {bookings.length} {bookings.length === 1 ? "booking" : "bookings"}
      </p>

      <div className="overflow-x-auto rounded-xl border border-border" tabIndex={0} role="region" aria-label="Bookings">
        <table className="w-full min-w-3xl text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Booking
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Seats
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Total
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Door
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
                checkIn={checkInAction.bind(null, org, booking.reference)}
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
  checkIn,
}: {
  booking: DashboardBooking;
  currency: string;
  showEmail: boolean;
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
      <td className="px-4 py-3">{BOOKING_STATUS_LABELS[status]}</td>
      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(booking.totalMinor, currency)}</td>
      <td className="px-4 py-3">
        {booking.checkedInAt ? (
          <span>
            Checked in {formatEventTime(booking.checkedInAt)}
            {booking.checkedInBy && <span className="block text-muted">by {booking.checkedInBy.name}</span>}
          </span>
        ) : status === "CONFIRMED" ? (
          <form action={checkIn}>
            <button
              type="submit"
              className={buttonClasses("secondary")}
              aria-label={`Check in ${booking.customerName} (${booking.reference})`}
            >
              Check in
            </button>
          </form>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
}
