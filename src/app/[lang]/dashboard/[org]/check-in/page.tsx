import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { getDictionary } from "@/i18n";
import { fill, localizePath, plural, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { isBookingReference } from "@/lib/booking-reference";
import { effectiveStatus } from "@/lib/booking-status";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { requireMembership } from "@/server/auth/dal";
import { db } from "@/server/db";
import { findBookingForCheckIn } from "@/server/repositories/dashboard";
import { checkInAction } from "../actions";
import { DashboardHeader } from "../../dashboard-header";

type Props = PageProps<"/[lang]/dashboard/[org]/check-in">;

/**
 * Door check-in. The QR code on a customer's booking page links here with ?ref=…, so
 * scanning it with a phone's camera opens the booking for a signed-in staff member.
 */
export default async function CheckInPage({ params, searchParams }: Props) {
  const { t } = await getDictionary();
  return (
    <Suspense fallback={<p className="text-muted">{t.dashboard.loading}</p>}>
      <CheckIn params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CheckIn({ params, searchParams }: Props) {
  const { org } = await params;
  const { ref } = await searchParams;
  const { locale, t } = await getDictionary();
  const reference = typeof ref === "string" ? ref.trim().toUpperCase() : "";
  const returnTo = localizePath(
    locale,
    `/dashboard/${org}/check-in${reference ? `?ref=${encodeURIComponent(reference)}` : ""}`,
  );
  const membership = await requireMembership(org, returnTo);
  const booking = isBookingReference(reference)
    ? await findBookingForCheckIn(db, membership.organization.id, reference)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader membership={membership} locale={locale} t={t.dashboard} />
      <h1 className="text-3xl font-semibold tracking-tight">{t.dashboard.checkInTitle}</h1>

      <form className="flex flex-wrap items-end gap-3" role="search" aria-label={t.dashboard.findLabel}>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t.dashboard.reference}
          <input
            name="ref"
            defaultValue={reference}
            placeholder="7KQM-4XPA"
            autoComplete="off"
            autoCapitalize="characters"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 font-mono text-base uppercase"
          />
        </label>
        <button type="submit" className={buttonClasses("secondary")}>
          {t.dashboard.find}
        </button>
      </form>

      {reference && !booking && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
          {fill(t.dashboard.noBooking, { reference, organizer: membership.organization.name })}
        </p>
      )}

      {booking && (
        <section
          aria-labelledby="guest-heading"
          className="flex max-w-xl flex-col gap-4 rounded-xl border border-border bg-surface p-6"
        >
          <div>
            <p className="font-mono text-sm text-muted">{booking.reference}</p>
            <h2 id="guest-heading" className="text-2xl font-semibold">
              {booking.customerName}
            </h2>
            <p className="text-muted">
              {booking.event.title} · {formatEventDate(booking.event.startsAt, locale)}
            </p>
          </div>
          <ul>
            {booking.seatLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          <CheckInStatus
            booking={booking}
            locale={locale}
            t={t}
            checkIn={checkInAction.bind(null, membership.organization.slug, booking.reference, locale)}
          />
        </section>
      )}
    </div>
  );
}

function CheckInStatus({
  booking,
  locale,
  t,
  checkIn,
}: {
  booking: NonNullable<Awaited<ReturnType<typeof findBookingForCheckIn>>>;
  locale: Locale;
  t: Dictionary;
  checkIn: () => Promise<void>;
}) {
  if (booking.checkedInAt) {
    const time = formatEventTime(booking.checkedInAt, locale);
    return (
      <p role="status" className="rounded-lg bg-accent-soft px-4 py-3 font-medium">
        {booking.checkedInBy
          ? fill(t.dashboard.checkedInStatusBy, { time, name: booking.checkedInBy.name })
          : fill(t.dashboard.checkedInStatus, { time })}
      </p>
    );
  }
  const status = effectiveStatus(booking);
  if (status !== "CONFIRMED") {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-danger">
        {fill(t.dashboard.notValid, { status: t.bookingStatus[status].toLowerCase() })}
      </p>
    );
  }
  return (
    <form action={checkIn}>
      <button type="submit" className={buttonClasses("primary", "w-full")}>
        {plural(t.dashboard.checkInGuests, booking.seatLabels.length)}
      </button>
    </form>
  );
}
