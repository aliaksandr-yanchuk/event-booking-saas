import { fill, type Locale } from "@/i18n/config";
import { dictionaryFor } from "@/i18n/dictionaries";
import { formatEventDate, formatEventTime } from "@/lib/dates";
import { escapeHtml } from "@/lib/html";
import { formatMoney } from "@/lib/money";
import { SITE_NAME } from "@/lib/site";

export type EmailTemplate = "booking-confirmed" | "booking-cancelled" | "payment-refunded";

export type EmailData = {
  // The customer's language: the email is written in it.
  locale: Locale;
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
  const t = dictionaryFor(data.locale).email;
  const when = `${formatEventDate(data.eventStartsAt, data.locale)} · ${formatEventTime(data.eventStartsAt, data.locale)}`;
  const total = formatMoney(data.totalMinor, data.currency, data.locale);
  const values = { event: data.eventTitle, reference: data.reference, total };
  const details = [
    `${data.eventTitle}`,
    `${when}, ${data.venue}`,
    ...data.seatLabels,
    fill(t.total, { total }),
    fill(t.reference, { reference: data.reference }),
  ];

  const content = {
    "booking-confirmed": {
      subject: fill(t.confirmed.subject, values),
      intro: t.confirmed.intro,
      links: [
        [t.confirmed.bookingLink, data.bookingUrl],
        [t.confirmed.manageLink, data.manageUrl],
      ],
    },
    "booking-cancelled": {
      subject: fill(t.cancelled.subject, values),
      intro: data.refunded ? fill(t.cancelled.introRefunded, values) : t.cancelled.intro,
      links: [[t.cancelled.bookingLink, data.bookingUrl]],
    },
    "payment-refunded": {
      subject: fill(t.refunded.subject, values),
      intro: fill(t.refunded.intro, values),
      links: [[t.refunded.bookingLink, data.bookingUrl]],
    },
  }[template];

  const greeting = fill(t.greeting, { name: data.customerName });
  const text = [
    greeting,
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
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(content.intro)}</p>`,
    `<p>${details.map(escapeHtml).join("<br>")}</p>`,
    `<p>${content.links.map(([label, url]) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`).join("<br>")}</p>`,
    `<p>— ${escapeHtml(SITE_NAME)}</p>`,
  ].join("\n");

  return { subject: content.subject, text, html };
}
