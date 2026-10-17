import type { PublicEvent } from "@/server/repositories/events";

/**
 * schema.org Event markup, so search engines can show the date, venue and
 * price range as a rich result. https://developers.google.com/search/docs/appearance/structured-data/event
 */
export function buildEventJsonLd(event: PublicEvent, url: string, seatsLeft: number) {
  const prices = event.sections.map((section) => section.priceMinor);
  const fractionDigits =
    new Intl.NumberFormat("en-US", { style: "currency", currency: event.currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const toMajor = (minor: number) => (minor / 10 ** fractionDigits).toFixed(fractionDigits);

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.summary,
    startDate: event.startsAt.toISOString(),
    endDate: event.endsAt.toISOString(),
    eventStatus:
      event.status === "CANCELLED"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url,
    location: {
      "@type": "Place",
      name: event.venue.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venue.address,
        addressLocality: event.venue.city,
        addressCountry: event.venue.country,
      },
    },
    organizer: {
      "@type": "Organization",
      name: event.organizationName,
    },
    ...(prices.length > 0 && {
      offers: {
        "@type": "AggregateOffer",
        url,
        priceCurrency: event.currency,
        lowPrice: toMajor(Math.min(...prices)),
        highPrice: toMajor(Math.max(...prices)),
        availability:
          seatsLeft > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      },
    }),
  };
}

/**
 * JSON.stringify does not escape "<", so a title containing "</script>" could
 * break out of the script tag. Escaping it keeps the payload inert.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
