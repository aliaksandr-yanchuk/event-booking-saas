import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDictionary } from "@/i18n";
import { fill, localizePath } from "@/i18n/config";
import { localizedAlternates } from "@/i18n/metadata";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getOrganization, getUpcomingEvents } from "@/server/queries";

type Props = PageProps<"/[lang]/[org]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await params;
  const [{ locale, t }, organization] = await Promise.all([getDictionary(), getOrganization(org)]);
  if (!organization) {
    return {};
  }
  return {
    title: fill(t.organizer.metaTitle, { name: organization.name }),
    description: fill(t.organizer.metaDescription, { name: organization.name }),
    alternates: localizedAlternates(locale, `/${organization.slug}`),
  };
}

export default async function OrganizationPage({ params }: Props) {
  const { t } = await getDictionary();
  return (
    <Suspense fallback={<p className="text-muted">{t.organizer.loading}</p>}>
      <OrganizationEvents params={params} />
    </Suspense>
  );
}

async function OrganizationEvents({ params }: Pick<Props, "params">) {
  const { org } = await params;
  const { locale, t } = await getDictionary();
  const organization = await getOrganization(org);
  if (!organization) {
    notFound();
  }
  const events = await getUpcomingEvents(organization.id);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">{t.organizer.label}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{organization.name}</h1>
      </header>

      {events.length === 0 ? (
        <p className="text-muted">{t.organizer.noEvents}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((event) => {
            const lowestPrice = Math.min(...event.sections.map((section) => section.priceMinor));
            return (
              <li key={event.id}>
                <article className="relative flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-medium">
                      {/* The link covers the whole card, while the heading stays the accessible name. */}
                      <Link
                        href={localizePath(locale, `/${organization.slug}/events/${event.slug}`)}
                        className="after:absolute after:inset-0"
                      >
                        {event.title}
                      </Link>
                    </h2>
                    <p className="text-sm text-muted">{event.summary}</p>
                    <p className="text-sm">
                      <time dateTime={event.startsAt.toISOString()}>
                        {formatEventDate(event.startsAt, locale)} · {formatEventTime(event.startsAt, locale)}
                      </time>{" "}
                      · {event.venue.name}, {event.venue.city}
                    </p>
                  </div>
                  {Number.isFinite(lowestPrice) && (
                    <p className="shrink-0 text-sm font-medium">
                      {lowestPrice === 0
                        ? t.organizer.free
                        : fill(t.organizer.from, { price: formatMoney(lowestPrice, event.currency, locale) })}
                    </p>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
