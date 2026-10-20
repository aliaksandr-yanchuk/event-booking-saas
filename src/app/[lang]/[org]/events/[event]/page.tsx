import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingForm } from "@/components/booking-form";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { buildEventJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { getDictionary } from "@/i18n";
import { localizePath } from "@/i18n/config";
import { localizedAlternates } from "@/i18n/metadata";
import { formatPrice } from "@/lib/money";
import { absoluteUrl } from "@/lib/site";
import type { PublicEvent } from "@/server/repositories/events";
import { getAvailableSeatCount, getOrganization, getPublicEvent, getSeatMap } from "@/server/queries";
import { bookSeatsAction } from "./actions";

type Props = PageProps<"/[lang]/[org]/events/[event]">;

async function loadEvent(params: Props["params"]) {
  const { org, event } = await params;
  const organization = await getOrganization(org);
  return organization ? getPublicEvent(organization.id, event) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ locale }, event] = await Promise.all([getDictionary(), loadEvent(params)]);
  if (!event) {
    return {};
  }
  const path = `/${event.organizationSlug}/events/${event.slug}`;
  const title = `${event.title} — ${formatEventDate(event.startsAt, locale)}, ${event.venue.city}`;
  return {
    title,
    description: event.summary,
    alternates: localizedAlternates(locale, path),
    openGraph: { type: "website", title, description: event.summary, url: localizePath(locale, path) },
    // The image itself comes from opengraph-image.tsx; Next.js adds og:image automatically,
    // and X falls back to og:image. "summary_large_image" shows it as a full-width card.
    twitter: { card: "summary_large_image", title, description: event.summary },
  };
}

export default async function EventPage({ params }: Props) {
  return (
    <Suspense fallback={<EventSkeleton />}>
      <EventContent params={params} />
    </Suspense>
  );
}

async function EventContent({ params }: Pick<Props, "params">) {
  const [{ locale, t }, event] = await Promise.all([getDictionary(), loadEvent(params)]);
  if (!event) {
    notFound();
  }
  const path = localizePath(locale, `/${event.organizationSlug}/events/${event.slug}`);
  const seatsLeft = await getAvailableSeatCount(event.id);
  const jsonLd = buildEventJsonLd(event, absoluteUrl(path), seatsLeft);

  return (
    <article className="flex flex-col gap-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <header className="flex flex-col gap-3">
        <Link
          href={localizePath(locale, `/${event.organizationSlug}`)}
          className="text-sm font-medium text-accent hover:underline"
        >
          ← {event.organizationName}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{event.title}</h1>
        <p className="text-lg text-muted">{event.summary}</p>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">{t.event.when}</dt>
          <dd>
            <time dateTime={event.startsAt.toISOString()}>
              {formatEventDate(event.startsAt, locale)} · {formatEventTime(event.startsAt, locale)}
            </time>
          </dd>
          <dt className="text-muted">{t.event.where}</dt>
          <dd>
            {event.venue.name}, {event.venue.address}, {event.venue.city}
          </dd>
          <dt className="text-muted">{t.event.prices}</dt>
          <dd>
            {event.sections
              .map(
                (section) =>
                  `${section.name} ${formatPrice(section.priceMinor, event.currency, { locale, free: t.organizer.free })}`,
              )
              .join(" · ")}
          </dd>
        </dl>
      </header>

      <section aria-labelledby="about-heading" className="flex max-w-2xl flex-col gap-2">
        <h2 id="about-heading" className="text-xl font-semibold">
          {t.event.about}
        </h2>
        <p className="leading-7">{event.description}</p>
      </section>

      <section aria-label={t.event.bookingRegion}>
        <Suspense fallback={<p className="text-muted">{t.event.loadingSeatMap}</p>}>
          <SeatSelection event={event} seatsLeft={seatsLeft} />
        </Suspense>
      </section>
    </article>
  );
}

async function SeatSelection({ event, seatsLeft }: { event: PublicEvent; seatsLeft: number }) {
  // Availability and "is it over?" must be checked per request, never prerendered.
  await connection();
  const { locale, t } = await getDictionary();

  if (event.status === "CANCELLED") {
    return <Notice>{t.event.cancelled}</Notice>;
  }
  if (event.startsAt <= new Date()) {
    return <Notice>{t.event.started}</Notice>;
  }
  if (seatsLeft === 0) {
    return <Notice>{t.event.soldOut}</Notice>;
  }

  const seatMap = await getSeatMap(event.id);
  return (
    <BookingForm
      action={bookSeatsAction.bind(null, event.organizationSlug, event.slug, locale)}
      locale={locale}
      // Only the strings the form shows, not the whole dictionary, go to the browser.
      t={{ form: t.bookingForm, seats: t.seats, free: t.organizer.free }}
      // New on every render (this part is never prerendered), so each visit is a new booking.
      idempotencyKey={crypto.randomUUID()}
      availabilityUrl={`/api/v1/organizations/${event.organizationSlug}/events/${event.slug}`}
      sections={seatMap}
      currency={event.currency}
      maxSeats={event.maxSeatsPerBooking}
    />
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-border bg-surface p-5">{children}</p>;
}

function EventSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-10 w-2/3 animate-pulse rounded-lg bg-border/50" />
      <div className="h-6 w-1/2 animate-pulse rounded-lg bg-border/50" />
      <div className="h-64 animate-pulse rounded-xl bg-border/50" />
    </div>
  );
}
