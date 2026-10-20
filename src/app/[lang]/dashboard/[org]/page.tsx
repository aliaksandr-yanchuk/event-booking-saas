import Link from "next/link";
import { Suspense } from "react";
import { getDictionary } from "@/i18n";
import { fill, localizePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireMembership } from "@/server/auth/dal";
import { db } from "@/server/db";
import { listEventSales, type EventSales } from "@/server/repositories/dashboard";
import { DashboardHeader } from "../dashboard-header";

type Props = PageProps<"/[lang]/dashboard/[org]">;

export default async function OrganizerDashboardPage({ params }: Props) {
  const { t } = await getDictionary();
  return (
    <Suspense fallback={<p className="text-muted">{t.dashboard.loadingEvents}</p>}>
      <EventsOverview params={params} />
    </Suspense>
  );
}

async function EventsOverview({ params }: Pick<Props, "params">) {
  const { org } = await params;
  const { locale, t: dict } = await getDictionary();
  const t = dict.dashboard;
  const membership = await requireMembership(org, localizePath(locale, `/dashboard/${org}`));
  const events = await listEventSales(db, membership.organization.id);
  const { isOwner } = membership;

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader membership={membership} locale={locale} t={t} />
      <h1 className="text-3xl font-semibold tracking-tight">{t.events}</h1>

      {isOwner && <RevenueSummary events={events} locale={locale} t={t} />}

      {/* Wide on purpose; scrolls sideways on phones. Focusable so keyboards can scroll it. */}
      <div
        className="overflow-x-auto rounded-xl border border-border"
        tabIndex={0}
        role="region"
        aria-label={t.eventsRegion}
      >
        <table className="w-full min-w-xl text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t.columns.event}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t.columns.status}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t.columns.sold}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t.columns.checkedIn}
              </th>
              {isOwner && (
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  {t.columns.revenue}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3">
                  <Link
                    href={localizePath(locale, `/dashboard/${org}/events/${event.slug}`)}
                    className="font-medium text-accent hover:underline"
                  >
                    {event.title}
                  </Link>
                  <span className="block text-muted">
                    {formatEventDate(event.startsAt, locale)} · {formatEventTime(event.startsAt, locale)}
                  </span>
                </td>
                <td className="px-4 py-3">{t.eventStatus[event.status]}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {event.sold} / {event.capacity}
                  {event.held > 0 && <span className="block text-muted">{fill(t.held, { count: event.held })}</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{event.checkedIn}</td>
                {isOwner && (
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(event.revenueMinor, event.currency, locale)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RevenueSummary({ events, locale, t }: { events: EventSales[]; locale: Locale; t: Dictionary["dashboard"] }) {
  // Revenue per currency: amounts in different currencies cannot be added up.
  const byCurrency = new Map<string, number>();
  for (const event of events) {
    byCurrency.set(event.currency, (byCurrency.get(event.currency) ?? 0) + event.revenueMinor);
  }
  const sold = events.reduce((sum, event) => sum + event.sold, 0);

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-surface p-5">
        <dt className="text-sm text-muted">{t.revenue}</dt>
        <dd className="text-2xl font-semibold tabular-nums" data-testid="total-revenue">
          {[...byCurrency].map(([currency, amount]) => formatMoney(amount, currency, locale)).join(" · ") || "—"}
        </dd>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <dt className="text-sm text-muted">{t.seatsSold}</dt>
        <dd className="text-2xl font-semibold tabular-nums">{sold}</dd>
      </div>
    </dl>
  );
}
