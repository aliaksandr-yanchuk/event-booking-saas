import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { SITE_NAME } from "@/lib/site";
import { getOrganization, getPublicEvent } from "@/server/queries";

/**
 * The preview card shown when an event link is shared (Slack, LINE, X, Facebook).
 * Next.js serves this at /{org}/events/{event}/opengraph-image and adds the
 * og:image tags to the event page automatically.
 *
 * Only details that rarely change are drawn. Platforms cache previews for days,
 * so live data such as "seats left" would quickly be wrong.
 */

export const alt = "Event title, date, venue and ticket price";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Colors from the light theme in globals.css (CSS variables are not available here).
const colors = {
  accent: "#1f5f4a",
  accentSoft: "#e4efe9",
  background: "#f7f7f5",
  foreground: "#1c1b19",
  muted: "#5f5d58",
};

export default async function Image({ params }: { params: Promise<{ org: string; event: string }> }) {
  const { org, event: eventSlug } = await params;
  const organization = await getOrganization(org);
  const event = organization ? await getPublicEvent(organization.id, eventSlug) : null;
  if (!event) {
    notFound();
  }

  const prices = event.sections.map((section) => section.priceMinor);
  const cancelled = event.status === "CANCELLED";

  // ImageResponse renders a subset of HTML/CSS (Satori): inline styles only, and
  // every element with more than one child needs display: flex.
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: colors.background,
        borderTop: `16px solid ${colors.accent}`,
        color: colors.foreground,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: colors.muted }}>
        <span>{event.organizationName}</span>
        <span style={{ color: colors.accent }}>{SITE_NAME}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {cancelled && (
          <span style={{ display: "flex", fontSize: 30, color: "#b42318", letterSpacing: 2 }}>CANCELLED</span>
        )}
        <span
          style={{
            fontSize: event.title.length > 32 ? 64 : 80,
            lineHeight: 1.1,
            letterSpacing: -2,
            // Long titles wrap to at most two lines instead of overflowing the card.
            lineClamp: 2,
          }}
        >
          {event.title}
        </span>
        <span style={{ fontSize: 34, color: colors.muted }}>
          {formatEventDate(event.startsAt)} · {formatEventTime(event.startsAt)}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 }}>
        <span style={{ color: colors.muted }}>
          {event.venue.name}, {event.venue.city}
        </span>
        {prices.length > 0 && !cancelled && (
          <span
            style={{
              display: "flex",
              padding: "12px 28px",
              borderRadius: 999,
              background: colors.accentSoft,
              color: colors.accent,
            }}
          >
            from {formatMoney(Math.min(...prices), event.currency)}
          </span>
        )}
      </div>
    </div>,
    { ...size },
  );
}
