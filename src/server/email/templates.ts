import { formatEventDate, formatEventTime } from "@/lib/dates";
import { escapeHtml } from "@/lib/html";
import { formatMoney } from "@/lib/money";
import { SITE_NAME } from "@/lib/site";

export type EmailTemplate = "booking-confirmed" | "booking-cancelled" | "payment-refunded";

export type EmailData = {
  customerName: string;
  reference: string;
  eventTitle: string;
  eventStartsAt: Date;
  venue: string;
  seatLabels: string[];
  totalMinor: number;
  currency: string;
  refunded: boolean;
  bookingUrl: string;
  manageUrl: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

/**
 * Plain text first (it is what many mail clients show in previews, and what the demo
 * inbox displays), with a simple HTML version. Every value from the booking is escaped
 * in the HTML: the customer's name is user input.
 */
export function renderEmail(template: EmailTemplate, data: EmailData): RenderedEmail {
  const when = `${formatEventDate(data.eventStartsAt)} · ${formatEventTime(data.eventStartsAt)}`;
  const total = formatMoney(data.totalMinor, data.currency);
  const details = [
    `${data.eventTitle}`,
    `${when}, ${data.venue}`,
    ...data.seatLabels,
    `Total: ${total}`,
    `Reference: ${data.reference}`,
  ];

  const content = {
    "booking-confirmed": {
      subject: `Your booking for ${data.eventTitle} (${data.reference})`,
      intro: `Your seats are booked. Show the QR code on your booking page at the door.`,
      links: [
        ["Your booking and ticket", data.bookingUrl],
        ["Manage or cancel your booking", data.manageUrl],
      ],
    },
    "booking-cancelled": {
      subject: `Booking ${data.reference} cancelled`,
      intro: data.refunded
        ? `Your booking has been cancelled and your payment of ${total} refunded in full.`
        : `Your booking has been cancelled and the seats released.`,
      links: [["Your booking", data.bookingUrl]],
    },
    "payment-refunded": {
      subject: `Your payment for ${data.eventTitle} was refunded`,
      intro:
        `Your payment arrived after the hold on your seats had run out, and another customer had ` +
        `booked some of them by then. The full amount of ${total} has been refunded.`,
      links: [["Your booking", data.bookingUrl]],
    },
  }[template];

  const text = [
    `Hello ${data.customerName},`,
    "",
    content.intro,
    "",
    ...details,
    "",
    ...content.links.map(([label, url]) => `${label}: ${url}`),
    "",
    `— ${SITE_NAME}`,
  ].join("\n");

  const html = [
    `<p>Hello ${escapeHtml(data.customerName)},</p>`,
    `<p>${escapeHtml(content.intro)}</p>`,
    `<p>${details.map(escapeHtml).join("<br>")}</p>`,
    `<p>${content.links.map(([label, url]) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`).join("<br>")}</p>`,
    `<p>— ${escapeHtml(SITE_NAME)}</p>`,
  ].join("\n");

  return { subject: content.subject, text, html };
}
