import { revalidateTag } from "next/cache";
import { cacheTags } from "@/server/cache-tags";
import { db } from "@/server/db";
import { scheduleEmailDelivery } from "@/server/email";
import { getPaymentProvider, getStripe } from "@/server/payments";
import { handleStripeEvent } from "@/server/payments/stripe-webhook";

/**
 * POST /api/webhooks/stripe — Stripe's notifications about checkout sessions.
 *
 * The signature is checked against the raw body (so it is read as text, never parsed
 * first). An error response makes Stripe retry with backoff for up to three days, which
 * is what we want while the database is unreachable; a bad signature gets 400.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe) {
    return new Response("Stripe is not configured", { status: 404 });
  }
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set; Stripe events cannot be verified");
    return new Response("Webhook secret is not configured", { status: 500 });
  }

  const payload = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const changed = await handleStripeEvent(db, getPaymentProvider(), event);
  scheduleEmailDelivery();
  if (changed) {
    revalidateTag(cacheTags.eventAvailability(changed.eventId), { expire: 0 });
  }
  return Response.json({ received: true });
}
