import { cancelBooking, createBooking } from "@/server/booking-service";
import type { Db } from "@/server/db";
import { verifyManageToken } from "@/server/email/manage-link";
import { deliverPendingEmails, MAX_ATTEMPTS } from "@/server/email/outbox";
import type { EmailSender } from "@/server/email/sender";
import { confirmPayment, expireCheckout, startCheckout } from "@/server/payment-service";
import {
  createEventWithSeats,
  createOrganization,
  createTestDb,
  customer,
  resetDatabase,
} from "../../../test/integration/factories";
import { createFakePayments } from "../../../test/integration/fake-payments";

let db: Db;

beforeAll(() => {
  db = createTestDb();
});

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(async () => {
  await db.$disconnect();
});

function recordingSender(fail = false) {
  const sent: { to: string; subject: string; text: string; idempotencyKey: string }[] = [];
  const sender: EmailSender = {
    name: "demo",
    async send(message, { idempotencyKey }) {
      if (fail) throw new Error("provider down");
      sent.push({ to: message.to, subject: message.subject, text: message.text, idempotencyKey });
    },
  };
  return { sender, sent };
}

async function setup(priceMinor = 5000) {
  const { provider, pay } = createFakePayments();
  const organization = await createOrganization(db);
  const { event, seats } = await createEventWithSeats(db, organization.id, { priceMinor });

  async function book(seatIndex: number) {
    const result = await createBooking(db, {
      ...customer,
      organizationId: organization.id,
      eventId: event.id,
      seatIds: [seats[seatIndex].id],
    });
    if (!result.ok) throw new Error(result.code);
    return result.reference;
  }

  async function bookAndPay(seatIndex: number) {
    const reference = await book(seatIndex);
    await startCheckout(db, provider, {
      organizationId: organization.id,
      reference,
      successUrl: "https://x.example/s",
      cancelUrl: "https://x.example/c",
    });
    const { checkoutSessionId } = await db.booking.findUniqueOrThrow({ where: { reference } });
    await confirmPayment(db, provider, { sessionId: checkoutSessionId!, paymentId: `pi_${reference}` });
    return { reference, sessionId: checkoutSessionId! };
  }

  const cancel = (reference: string) =>
    cancelBooking(db, provider, { organizationId: organization.id, reference, customerEmail: customer.customerEmail });
  const queued = async () =>
    (await db.emailMessage.findMany({ orderBy: { createdAt: "asc" }, select: { template: true, to: true } })).map(
      (m) => m.template,
    );

  return { organization, event, seats, provider, pay, book, bookAndPay, cancel, queued };
}

describe("emails are queued with the booking change they report", () => {
  it("queues a confirmation for a free booking at once, and for a paid one only when it is paid", async () => {
    const free = await setup(0);
    await free.book(0);
    expect(await free.queued()).toEqual(["booking-confirmed"]);

    await resetDatabase(db);
    const paid = await setup();
    const reference = await paid.book(0);
    expect(await paid.queued()).toEqual([]);

    await paid.cancel(reference); // releasing an unpaid hold: no email
    expect(await paid.queued()).toEqual([]);

    await paid.bookAndPay(1);
    expect(await paid.queued()).toEqual(["booking-confirmed"]);
  });

  it("queues one confirmation however often the payment is reported", async () => {
    const { bookAndPay, provider, queued } = await setup();
    const { sessionId } = await bookAndPay(0);

    await confirmPayment(db, provider, { sessionId, paymentId: "pi_again" });
    await confirmPayment(db, provider, { sessionId, paymentId: "pi_again" });

    expect(await queued()).toEqual(["booking-confirmed"]);
  });

  it("queues a cancellation for a confirmed booking, and a refund notice for a late payment", async () => {
    const { bookAndPay, cancel, book, provider, seats, organization, event, queued } = await setup();
    const { reference } = await bookAndPay(0);
    await cancel(reference);
    expect(await queued()).toEqual(["booking-confirmed", "booking-cancelled"]);

    // A hold expires, someone else takes the seat, then the first customer's payment arrives.
    const late = await book(1);
    await startCheckout(db, provider, {
      organizationId: organization.id,
      reference: late,
      successUrl: "https://x.example/s",
      cancelUrl: "https://x.example/c",
    });
    const { checkoutSessionId } = await db.booking.findUniqueOrThrow({ where: { reference: late } });
    await expireCheckout(db, { sessionId: checkoutSessionId! });
    await createBooking(db, {
      customerName: "Ken Sato",
      customerEmail: "ken@example.com",
      organizationId: organization.id,
      eventId: event.id,
      seatIds: [seats[1].id],
    });
    await confirmPayment(db, provider, { sessionId: checkoutSessionId!, paymentId: "pi_late" });

    expect(await queued()).toEqual(["booking-confirmed", "booking-cancelled", "payment-refunded"]);
  });

  it("queues nothing for bookings that lost a race", async () => {
    const { organization, event, seats, queued } = await setup(0);

    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        createBooking(db, {
          customerName: `C${i}`,
          customerEmail: `c${i}@example.com`,
          organizationId: organization.id,
          eventId: event.id,
          seatIds: [seats[0].id],
        }),
      ),
    );

    expect(await queued()).toEqual(["booking-confirmed"]);
  });
});

describe("deliverPendingEmails", () => {
  it("renders, sends and records each message, with a manage link that works", async () => {
    const { bookAndPay } = await setup();
    const { reference } = await bookAndPay(0);
    const { sender, sent } = recordingSender();

    expect(await deliverPendingEmails(db, sender)).toEqual({ sent: 1, failed: 0 });

    expect(sent).toEqual([
      expect.objectContaining({
        to: customer.customerEmail,
        subject: `Your booking for Test Event (${reference})`,
        idempotencyKey: expect.stringMatching(/^email-/),
      }),
    ]);
    const stored = await db.emailMessage.findFirstOrThrow({ include: { booking: true } });
    expect(stored).toMatchObject({ status: "SENT", attempts: 1, sentAt: expect.any(Date), subject: sent[0].subject });

    const token = /manage\?t=(\S+)/.exec(sent[0].text)![1];
    expect(verifyManageToken(token, { bookingId: stored.booking.id, email: customer.customerEmail })).toBe(true);

    // Nothing left to send.
    expect(await deliverPendingEmails(db, sender)).toEqual({ sent: 0, failed: 0 });
  });

  it("retries a failed send, and gives up after the last attempt", async () => {
    const { book } = await setup(0);
    await book(0);
    const failing = recordingSender(true);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      expect(await deliverPendingEmails(db, failing.sender)).toEqual({ sent: 0, failed: 1 });
    }

    const stored = await db.emailMessage.findFirstOrThrow();
    expect(stored).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS, lastError: "provider down" });
    const working = recordingSender();
    expect(await deliverPendingEmails(db, working.sender)).toEqual({ sent: 0, failed: 0 });
  });

  it("sends every message once when several delivery runs overlap", async () => {
    const { book } = await setup(0);
    for (let seat = 0; seat < 6; seat++) {
      await book(seat);
    }
    const { sender, sent } = recordingSender();

    await Promise.all(Array.from({ length: 4 }, () => deliverPendingEmails(db, sender, { limit: 3 })));
    await deliverPendingEmails(db, sender);

    expect(sent).toHaveLength(6);
    expect(new Set(sent.map((message) => message.idempotencyKey)).size).toBe(6);
  });

  it("leaves a message claimed by a run that crashed until its claim runs out", async () => {
    const { book } = await setup(0);
    await book(0);
    const now = new Date();
    await db.emailMessage.updateMany({ data: { lockedUntil: new Date(now.getTime() + 30_000) } });
    const { sender, sent } = recordingSender();

    await deliverPendingEmails(db, sender, { now });
    expect(sent).toHaveLength(0);

    await deliverPendingEmails(db, sender, { now: new Date(now.getTime() + 30_000) });
    expect(sent).toHaveLength(1);
  });
});
