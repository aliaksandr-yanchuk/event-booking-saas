import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/i18n/config";
import { absoluteUrl } from "@/lib/site";
import type { Db } from "@/server/db";
import { signManageToken } from "@/server/email/manage-link";
import type { EmailSender } from "@/server/email/sender";
import { renderEmail, type EmailTemplate } from "@/server/email/templates";

/**
 * Transactional outbox for customer emails. Writers call enqueueEmail() inside the
 * transaction that changes the booking; deliverPendingEmails() sends them afterwards.
 */

export const MAX_ATTEMPTS = 5;
const CLAIM_MS = 60_000;

export async function enqueueEmail(
  tx: Prisma.TransactionClient,
  booking: { id: string; customerEmail: string },
  template: EmailTemplate,
) {
  await tx.emailMessage.create({ data: { bookingId: booking.id, to: booking.customerEmail, template } });
}

export type DeliveryReport = { sent: number; failed: number };

/**
 * Sends pending emails, oldest first. Each run claims its messages with
 * FOR UPDATE SKIP LOCKED, so runs in parallel (two requests finishing at once, several
 * server instances) never pick the same message, and a run that crashes releases its
 * claim when lockedUntil passes. A failed send is retried by a later run, up to
 * MAX_ATTEMPTS; the sender's idempotency key keeps a retried send from arriving twice.
 */
export async function deliverPendingEmails(
  db: Db,
  sender: EmailSender,
  options: { now?: Date; limit?: number } = {},
): Promise<DeliveryReport> {
  const now = options.now ?? new Date();
  const lockedUntil = new Date(now.getTime() + CLAIM_MS);
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE email_messages SET attempts = attempts + 1, "lockedUntil" = ${lockedUntil}::timestamp(3)
    WHERE id IN (
      SELECT id FROM email_messages
      WHERE status = 'PENDING' AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now}::timestamp(3))
      ORDER BY "createdAt"
      LIMIT ${options.limit ?? 20}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;

  const report: DeliveryReport = { sent: 0, failed: 0 };
  for (const { id } of claimed) {
    const message = await db.emailMessage.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        to: true,
        template: true,
        attempts: true,
        booking: {
          select: {
            id: true,
            reference: true,
            customerName: true,
            customerEmail: true,
            seatLabels: true,
            totalMinor: true,
            refundedAt: true,
            locale: true,
            organization: { select: { slug: true } },
            event: {
              select: { title: true, startsAt: true, currency: true, venue: { select: { name: true, city: true } } },
            },
          },
        },
      },
    });
    try {
      const { booking } = message;
      // Links open the pages in the language the customer booked in.
      const locale = isLocale(booking.locale) ? booking.locale : DEFAULT_LOCALE;
      const bookingPath = localizePath(locale, `/${booking.organization.slug}/bookings/${booking.reference}`);
      // The link works until the event starts; after that there is nothing to manage.
      const token = signManageToken({ bookingId: booking.id, email: booking.customerEmail }, booking.event.startsAt);
      const rendered = renderEmail(message.template as EmailTemplate, {
        locale,
        customerName: booking.customerName,
        reference: booking.reference,
        eventTitle: booking.event.title,
        eventStartsAt: booking.event.startsAt,
        venue: `${booking.event.venue.name}, ${booking.event.venue.city}`,
        seatLabels: booking.seatLabels,
        totalMinor: booking.totalMinor,
        currency: booking.event.currency,
        refunded: booking.refundedAt !== null,
        bookingUrl: absoluteUrl(bookingPath),
        manageUrl: absoluteUrl(`${bookingPath}/manage?t=${token}`),
      });
      await sender.send({ ...rendered, to: message.to }, { idempotencyKey: `email-${message.id}` });
      await db.emailMessage.update({
        where: { id },
        data: { status: "SENT", sentAt: now, lockedUntil: null, lastError: null, ...rendered },
      });
      report.sent += 1;
    } catch (error) {
      const gaveUp = message.attempts >= MAX_ATTEMPTS;
      await db.emailMessage.update({
        where: { id },
        data: {
          status: gaveUp ? "FAILED" : "PENDING",
          // Released at once, so the next run retries it.
          lockedUntil: null,
          lastError: error instanceof Error ? error.message.slice(0, 500) : String(error),
        },
      });
      console.error("Email delivery failed", { id, attempts: message.attempts, gaveUp, error });
      report.failed += 1;
    }
  }
  return report;
}
