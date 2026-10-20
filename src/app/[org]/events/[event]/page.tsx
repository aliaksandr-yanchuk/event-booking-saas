import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingForm } from "@/components/booking-form";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { buildEventJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { formatMoney } from "@/lib/money";
import { absoluteUrl } from "@/lib/site";
import type { PublicEvent } from "@/server/repositories/events";
import { getAvailableSeatCount, getOrganization, getPublicEvent, getSeatMap } from "@/server/queries";
import { bookSeatsAction } from "./actions";

type Props = PageProps<"/[org]/events/[event]">;

async function loadEvent(params: Props["params"]) {
  const { org, event } = await params;
  const organization = await getOrganization(org);
  return organization ? getPublicEvent(organization.id, event) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await loadEvent(params);
  if (!event) {
    return {};
  }
  const path = `/${event.organizationSlug}/events/${event.slug}`;
  const title = `${event.title} — ${formatEventDate(event.startsAt)}, ${event.venue.city}`;
  return {
    title,
    description: event.summary,
    alternates: { canonical: path },
    openGraph: { type: "website", title, description: event.summary, url: path },
    // The image itself comes from opengraph-image.tsx; Next.js adds og:image automatically,
    // and X falls back to og:image. "summary_large_image" shows it as a full-width card.
    twitter: { card: "summary_large_image", title, description: event.summary },
  };
}

export default function EventPage({ params }: Props) {
  return (
    <Suspense fallback={<EventSkeleton />}>
      <EventContent params={params} />
    </Suspense>
  );
}

async function EventContent({ params }: Pick<Props, "params">) {
  const event = await loadEvent(params);
  if (!event) {
    notFound();
  }
  const path = `/${event.organizationSlug}/events/${event.slug}`;
  const seatsLeft = await getAvailableSeatCount(event.id);
  const jsonLd = buildEventJsonLd(event, absoluteUrl(path), seatsLeft);

  return (
    <article className="flex flex-col gap-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <header className="flex flex-col gap-3">
        <Link href={`/${event.organizationSlug}`} className="text-sm font-medium text-accent hover:underline">
          ← {event.organizationName}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{event.title}</h1>
        <p className="text-lg text-muted">{event.summary}</p>
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">When</dt>
          <dd>
            <time dateTime={event.startsAt.toISOString()}>
              {formatEventDate(event.startsAt)} · {formatEventTime(event.startsAt)}
            </time>
          </dd>
          <dt className="text-muted">Where</dt>
          <dd>
            {event.venue.name}, {event.venue.address}, {event.venue.city}
          </dd>
          <dt className="text-muted">Prices</dt>
          <dd>
            {event.sections
              .map((section) => `${section.name} ${formatMoney(section.priceMinor, event.currency)}`)
              .join(" · ")}
          </dd>
        </dl>
      </header>

      <section aria-labelledby="about-heading" className="flex max-w-2xl flex-col gap-2">
        <h2 id="about-heading" className="text-xl font-semibold">
          About this event
        </h2>
        <p className="leading-7">{event.description}</p>
      </section>

      <section aria-label="Booking">
        <Suspense fallback={<p className="text-muted">Loading seat map…</p>}>
          <SeatSelection event={event} seatsLeft={seatsLeft} />
        </Suspense>
      </section>
    </article>
  );
}

async function SeatSelection({ event, seatsLeft }: { event: PublicEvent; seatsLeft: number }) {
  // Availability and "is it over?" must be checked per request, never prerendered.
  await connection();

  if (event.status === "CANCELLED") {
    return <Notice>This event has been cancelled. Bookings are closed.</Notice>;
  }
  if (event.startsAt <= new Date()) {
    return <Notice>This event has already started. Bookings are closed.</Notice>;
  }
  if (seatsLeft === 0) {
    return <Notice>Sold out. All seats for this event are booked.</Notice>;
  }

  const seatMap = await getSeatMap(event.id);
  return (
    <BookingForm
      action={bookSeatsAction.bind(null, event.organizationSlug, event.slug)}
      // New on every render (this part is never prerendered), so each visit is a new booking.
      idempotencyKey={crypto.randomUUID()}
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
