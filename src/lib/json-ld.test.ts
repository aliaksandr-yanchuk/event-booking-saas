import { buildEventJsonLd, serializeJsonLd } from "./json-ld";
import type { PublicEvent } from "@/server/repositories/events";

const event: PublicEvent = {
  id: "evt_1",
  organizationId: "org_1",
  organizationName: "Harbor Hall Live",
  organizationSlug: "harbor-hall",
  slug: "midnight-jazz",
  title: "Midnight Jazz",
  summary: "Late-night jazz.",
  description: "Long description",
  startsAt: new Date("2026-11-01T10:00:00Z"),
  endsAt: new Date("2026-11-01T12:00:00Z"),
  status: "PUBLISHED",
  currency: "JPY",
  maxSeatsPerBooking: 6,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  venue: { name: "Harbor Hall", address: "2-1 Kaigan-dori", city: "Yokohama", country: "JP" },
  sections: [
    { id: "s1", name: "Floor", priceMinor: 8000 },
    { id: "s2", name: "Balcony", priceMinor: 5000 },
  ],
};

describe("buildEventJsonLd", () => {
  it("describes the event, venue and price range", () => {
    const jsonLd = buildEventJsonLd(event, "https://example.com/harbor-hall/events/midnight-jazz", 12);

    expect(jsonLd).toMatchObject({
      "@type": "Event",
      name: "Midnight Jazz",
      startDate: "2026-11-01T10:00:00.000Z",
      eventStatus: "https://schema.org/EventScheduled",
      location: { name: "Harbor Hall", address: { addressLocality: "Yokohama", addressCountry: "JP" } },
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "JPY",
        lowPrice: "5000",
        highPrice: "8000",
        availability: "https://schema.org/InStock",
      },
    });
  });

  it("marks sold-out and cancelled events", () => {
    const jsonLd = buildEventJsonLd({ ...event, status: "CANCELLED" }, "https://example.com/e", 0);

    expect(jsonLd.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(jsonLd.offers?.availability).toBe("https://schema.org/SoldOut");
  });

  it("uses major units for currencies with cents", () => {
    const jsonLd = buildEventJsonLd(
      { ...event, currency: "USD", sections: [{ id: "s1", name: "GA", priceMinor: 2550 }] },
      "https://example.com/e",
      1,
    );

    expect(jsonLd.offers).toMatchObject({ lowPrice: "25.50", highPrice: "25.50" });
  });

  it("omits offers when the event has no sections", () => {
    expect(buildEventJsonLd({ ...event, sections: [] }, "https://example.com/e", 0)).not.toHaveProperty("offers");
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so a title cannot close the script tag", () => {
    const output = serializeJsonLd({ name: "</script><script>alert(1)</script>" });

    expect(output).not.toContain("</script>");
    expect(JSON.parse(output)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
