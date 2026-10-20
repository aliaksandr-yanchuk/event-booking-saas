import Link from "next/link";
import { Suspense } from "react";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { requireMembership } from "@/server/auth/dal";
import { db } from "@/server/db";
import { listEventSales, type EventSales } from "@/server/repositories/dashboard";
import { DashboardHeader } from "../dashboard-header";

type Props = PageProps<"/dashboard/[org]">;

export default function OrganizerDashboardPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="text-muted">Loading your events…</p>}>
      <EventsOverview params={params} />
    </Suspense>
  );
}

const EVENT_STATUS = { DRAFT: "Draft", PUBLISHED: "On sale", CANCELLED: "Cancelled" } as const;

async function EventsOverview({ params }: Pick<Props, "params">) {
  const { org } = await params;
  const membership = await requireMembership(org, `/dashboard/${org}`);
  const events = await listEventSales(db, membership.organization.id);
  const { isOwner } = membership;

  return (
    <div className="flex flex-col gap-8">
      <DashboardHeader membership={membership} />
      <h1 className="text-3xl font-semibold tracking-tight">Events</h1>

      {isOwner && <RevenueSummary events={events} />}

      {/* Wide on purpose; scrolls sideways on phones. Focusable so keyboards can scroll it. */}
      <div className="overflow-x-auto rounded-xl border border-border" tabIndex={0} role="region" aria-label="Events">
        <table className="w-full min-w-xl text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Event
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Sold
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Checked in
              </th>
              {isOwner && (
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Revenue
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/${org}/events/${event.slug}`}
                    className="font-medium text-accent hover:underline"
                  >
                    {event.title}
                  </Link>
                  <span className="block text-muted">
                    {formatEventDate(event.startsAt)} · {formatEventTime(event.startsAt)}
                  </span>
                </td>
                <td className="px-4 py-3">{EVENT_STATUS[event.status]}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {event.sold} / {event.capacity}
                  {event.held > 0 && <span className="block text-muted">{event.held} held</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{event.checkedIn}</td>
                {isOwner && (
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMoney(event.revenueMinor, event.currency)}
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

function RevenueSummary({ events }: { events: EventSales[] }) {
  // Revenue per currency: amounts in different currencies cannot be added up.
  const byCurrency = new Map<string, number>();
  for (const event of events) {
    byCurrency.set(event.currency, (byCurrency.get(event.currency) ?? 0) + event.revenueMinor);
  }
  const sold = events.reduce((sum, event) => sum + event.sold, 0);

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-surface p-5">
        <dt className="text-sm text-muted">Revenue</dt>
        <dd className="text-2xl font-semibold tabular-nums" data-testid="total-revenue">
          {[...byCurrency].map(([currency, amount]) => formatMoney(amount, currency)).join(" · ") || "—"}
        </dd>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <dt className="text-sm text-muted">Seats sold</dt>
        <dd className="text-2xl font-semibold tabular-nums">{sold}</dd>
      </div>
    </dl>
  );
}
