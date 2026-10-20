import { after } from "next/server";
import { db } from "@/server/db";
import { deliverPendingEmails } from "@/server/email/outbox";
import { getEmailSender } from "@/server/email/sender";

/**
 * Delivers queued emails after the response has been sent (Next.js `after`), so the
 * customer never waits for the email provider. Call it from any Server Action or route
 * handler that may have queued an email. It also picks up messages that earlier runs
 * could not send, so a forgotten call or a failed attempt only delays an email.
 */
export function scheduleEmailDelivery() {
  after(async () => {
    await deliverPendingEmails(db, getEmailSender());
  });
}
