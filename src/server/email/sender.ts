import type { RenderedEmail } from "@/server/email/templates";

/** Where emails go: Resend in production, nowhere (the outbox row is the record) otherwise. */
export interface EmailSender {
  readonly name: "resend" | "demo";
  // idempotencyKey: the same message, retried after a timeout, is delivered once.
  send(message: RenderedEmail & { to: string }, options: { idempotencyKey: string }): Promise<void>;
}

/**
 * Without Resend keys, nothing leaves the app: messages are marked sent, and the booking
 * page's demo inbox shows them. Like the demo checkout, it runs the real outbox code.
 */
export const demoEmailSender: EmailSender = {
  name: "demo",
  async send() {},
};

/** Resend's REST API, called with fetch (one endpoint does not need an SDK). */
export function createResendSender(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): EmailSender {
  return {
    name: "resend",
    async send(message, { idempotencyKey }) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!response.ok) {
        throw new Error(`Resend answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
      }
    },
  };
}

export function getEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return apiKey && from ? createResendSender(apiKey, from) : demoEmailSender;
}
