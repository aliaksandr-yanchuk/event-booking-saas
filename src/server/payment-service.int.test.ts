import { cancelBooking, createBooking } from "@/server/booking-service";
import type { Db } from "@/server/db";
import { confirmPayment, expireCheckout, startCheckout, syncCheckout } from "@/server/payment-service";
import type Stripe from "stripe";
import { CHECKOUT_TTL_MS, HOLD_TTL_MS } from "@/server/payments/provider";
import { handleStripeEvent } from "@/server/payments/stripe-webhook";
import { countAvailableSeats, getSeatMap } from "@/server/repositories/events";
import {
  createEventWithSeats,
  createOrganization,
  createTestDb,
  customer,
  resetDatabase,
} from "../../test/integration/factories";
import { createFakePayments } from "../../test/integration/fake-payments";

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

const MINUTE = 60_000;
const t0 = new Date("2026-10-20T03:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

async function setup(options: { priceMinor?: number } = {}) {
  const fake = createFakePayments();
  const organization = await createOrganization(db);
  const { event, seats } = await createEventWithSeats(db, organization.id, {
    priceMinor: options.priceMinor,
    startsAt: later(7 * 24 * 60 * MINUTE),
  });
  const urls = { successUrl: "https://seatline.example/return", cancelUrl: "https://seatline.example/booking" };

  async function hold(seatIds: string[], now = t0, who = customer) {
    const result = await createBooking(
      db,
      { ...who, organizationId: organization.id, eventId: event.id, seatIds },
      { now },
    );
    if (!result.ok) throw new Error(`hold failed: ${result.code}`);
    return result;
  }

  async function holdAndCheckout(seatIds: string[], now = t0) {
    const booking = await hold(seatIds, now);
    const checkout = await startCheckout(
      db,
      fake.provider,
      { organizationId: organization.id, reference: booking.reference, ...urls },
      { now },
    );
    if (!checkout.ok) throw new Error("checkout failed");
    const { checkoutSessionId } = await db.booking.findUniqueOrThrow({ where: { reference: booking.reference } });
    return { ...booking, url: checkout.url, sessionId: checkoutSessionId! };
  }

  const status = async (reference: string) => (await db.booking.findUniqueOrThrow({ where: { reference } })).status;
  const takenAt = async (now: Date) =>
    (await getSeatMap(db, event.id, now))[0].seats.filter((seat) => seat.taken).map((seat) => seat.number);

  return { ...fake, organization, event, seats, urls, hold, holdAndCheckout, status, takenAt };
}

describe("seat holds", () => {
  it("holds paid seats as PENDING until the hold expires, and confirms free ones at once", async () => {
    const paid = await setup({ priceMinor: 5000 });
    const free = await setup({ priceMinor: 0 });

    expect(await paid.hold([paid.seats[0].id])).toMatchObject({
      status: "PENDING",
      expiresAt: later(HOLD_TTL_MS),
    });
    expect(await free.hold([free.seats[0].id])).toMatchObject({ status: "CONFIRMED", expiresAt: null });
  });

  it("counts a held seat as taken only until the hold expires", async () => {
    const { hold, seats, event, takenAt } = await setup();
    await hold([seats[0].id]);

    expect(await takenAt(later(HOLD_TTL_MS - 1))).toEqual([1]);
    expect(await takenAt(later(HOLD_TTL_MS))).toEqual([]);
    expect(await countAvailableSeats(db, event.id, later(HOLD_TTL_MS - 1))).toBe(seats.length - 1);
    expect(await countAvailableSeats(db, event.id, later(HOLD_TTL_MS))).toBe(seats.length);
  });

  it("rejects a seat that is held by someone else", async () => {
    const { hold, seats, organization, event } = await setup();
    await hold([seats[0].id]);

    const second = await createBooking(
      db,
      { ...customer, organizationId: organization.id, eventId: event.id, seatIds: [seats[0].id] },
      { now: later(10 * MINUTE) },
    );

    expect(second).toEqual({ ok: false, code: "SEATS_TAKEN", takenSeatIds: [seats[0].id] });
  });

  it("lets a new booking take a seat whose hold expired, and marks the old hold EXPIRED", async () => {
    const { hold, seats, status } = await setup();
    const first = await hold([seats[0].id, seats[1].id]);

    const second = await hold([seats[1].id], later(HOLD_TTL_MS + MINUTE));

    expect(second.status).toBe("PENDING");
    expect(await status(first.reference)).toBe("EXPIRED");
    // The expired hold released all of its seats, not only the one that was wanted.
    expect(await db.bookingSeat.count({ where: { seatId: seats[0].id } })).toBe(0);
  });

  it("gives an expired seat to exactly one of many simultaneous bookings", async () => {
    const { hold, seats, organization, event } = await setup();
    await hold([seats[0].id]);

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        createBooking(
          db,
          {
            customerName: `Customer ${i}`,
            customerEmail: `c${i}@example.com`,
            organizationId: organization.id,
            eventId: event.id,
            seatIds: [seats[0].id],
          },
          { now: later(HOLD_TTL_MS + MINUTE) },
        ),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db.bookingSeat.count({ where: { seatId: seats[0].id } })).toBe(1);
  });
});

describe("startCheckout", () => {
  it("creates one checkout per hold, renews the hold to outlast it, and returns the same URL again", async () => {
    const { hold, seats, organization, urls, provider, calls } = await setup();
    const booking = await hold([seats[0].id, seats[1].id]);
    const command = { organizationId: organization.id, reference: booking.reference, ...urls };

    const first = await startCheckout(db, provider, command, { now: later(MINUTE) });
    const again = await startCheckout(db, provider, command, { now: later(2 * MINUTE) });

    expect(first).toEqual(again);
    expect(calls.created).toHaveLength(1);
    expect(calls.created[0]).toMatchObject({
      bookingReference: booking.reference,
      totalMinor: 10000,
      currency: "JPY",
      customerEmail: customer.customerEmail,
      expiresAt: later(MINUTE + CHECKOUT_TTL_MS),
    });
    const stored = await db.booking.findUniqueOrThrow({ where: { reference: booking.reference } });
    expect(stored.expiresAt).toEqual(later(MINUTE + HOLD_TTL_MS));
  });

  it("refuses bookings that no longer wait for payment", async () => {
    const free = await setup({ priceMinor: 0 });
    const booking = await free.hold([free.seats[0].id]);
    const expired = await setup();
    const held = await expired.hold([expired.seats[0].id]);

    expect(
      await startCheckout(db, free.provider, {
        organizationId: free.organization.id,
        reference: booking.reference,
        ...free.urls,
      }),
    ).toMatchObject({ ok: false, code: "NOT_PENDING" });
    expect(
      await startCheckout(
        db,
        expired.provider,
        { organizationId: expired.organization.id, reference: held.reference, ...expired.urls },
        { now: later(HOLD_TTL_MS) },
      ),
    ).toMatchObject({ ok: false, code: "NOT_PENDING" });
  });
});

describe("confirmPayment", () => {
  it("confirms a held booking, and treats a repeated notification as a no-op", async () => {
    const { holdAndCheckout, seats, provider, status } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);
    const payment = { sessionId: booking.sessionId, paymentId: "pi_1" };

    const first = await confirmPayment(db, provider, payment, { now: later(5 * MINUTE) });
    const repeat = await confirmPayment(db, provider, payment, { now: later(6 * MINUTE) });

    expect(first).toMatchObject({ ok: true, outcome: "CONFIRMED" });
    expect(repeat).toMatchObject({ ok: true, outcome: "ALREADY_CONFIRMED" });
    expect(await status(booking.reference)).toBe("CONFIRMED");
    const stored = await db.booking.findUniqueOrThrow({ where: { reference: booking.reference } });
    expect(stored).toMatchObject({ paymentId: "pi_1", paidAt: later(5 * MINUTE), expiresAt: null });
  });

  it("confirms a hold that ran out if nobody has taken its seats yet", async () => {
    const { holdAndCheckout, seats, provider, status } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);

    const result = await confirmPayment(
      db,
      provider,
      { sessionId: booking.sessionId, paymentId: "pi_1" },
      { now: later(HOLD_TTL_MS + 10 * MINUTE) },
    );

    expect(result).toMatchObject({ outcome: "CONFIRMED" });
    expect(await status(booking.reference)).toBe("CONFIRMED");
  });

  it("takes the seats back for a late payment when they are still free", async () => {
    const { holdAndCheckout, seats, provider, status, takenAt, calls } = await setup();
    const booking = await holdAndCheckout([seats[0].id, seats[1].id]);
    await expireCheckout(db, { sessionId: booking.sessionId });
    expect(await takenAt(later(MINUTE))).toEqual([]);

    const result = await confirmPayment(db, provider, { sessionId: booking.sessionId, paymentId: "pi_late" });

    expect(result).toMatchObject({ outcome: "CONFIRMED" });
    expect(await status(booking.reference)).toBe("CONFIRMED");
    expect(await takenAt(later(MINUTE))).toEqual([1, 2]);
    expect(calls.refunds).toEqual([]);
  });

  it("refunds a late payment when another customer took a seat meanwhile", async () => {
    const { holdAndCheckout, hold, seats, provider, status, calls } = await setup();
    const booking = await holdAndCheckout([seats[0].id, seats[1].id]);
    const other = await hold([seats[1].id], later(HOLD_TTL_MS + MINUTE), {
      customerName: "Ken Sato",
      customerEmail: "ken@example.com",
    });

    const payment = { sessionId: booking.sessionId, paymentId: "pi_late" };
    const result = await confirmPayment(db, provider, payment);
    const repeat = await confirmPayment(db, provider, payment);

    expect(result).toMatchObject({ outcome: "REFUNDED" });
    expect(repeat).toMatchObject({ outcome: "REFUNDED" });
    expect(await status(booking.reference)).toBe("REFUNDED");
    expect(await status(other.reference)).toBe("PENDING");
    // Refunded once, with a key that makes a retried refund safe.
    expect(calls.refunds).toEqual([{ paymentId: "pi_late", idempotencyKey: expect.stringMatching(/^refund-/) }]);
    // The failed attempt to take the seats back left nothing behind.
    expect(await db.bookingSeat.count({ where: { seatId: seats[0].id } })).toBe(0);
  });

  it("refunds a payment for a hold the customer had already released", async () => {
    const { holdAndCheckout, seats, provider, organization, status, calls } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);
    await cancelBooking(db, provider, {
      organizationId: organization.id,
      reference: booking.reference,
      customerEmail: customer.customerEmail,
    });

    const result = await confirmPayment(db, provider, { sessionId: booking.sessionId, paymentId: "pi_1" });

    expect(result).toMatchObject({ outcome: "REFUNDED" });
    expect(await status(booking.reference)).toBe("REFUNDED");
    expect(calls.refunds).toHaveLength(1);
  });

  it("a late payment and a new customer racing for an expired hold: exactly one gets the seat", async () => {
    for (let round = 0; round < 5; round++) {
      await resetDatabase(db);
      const { holdAndCheckout, seats, provider, organization, event, calls } = await setup();
      const booking = await holdAndCheckout([seats[0].id]);

      const [payment, newcomer] = await Promise.all([
        confirmPayment(db, provider, { sessionId: booking.sessionId, paymentId: "pi_late" }),
        createBooking(
          db,
          {
            ...customer,
            customerEmail: "ken@example.com",
            organizationId: organization.id,
            eventId: event.id,
            seatIds: [seats[0].id],
          },
          { now: later(HOLD_TTL_MS + MINUTE) },
        ),
      ]);

      expect(await db.bookingSeat.count({ where: { seatId: seats[0].id } })).toBe(1);
      if (newcomer.ok) {
        expect(payment).toMatchObject({ outcome: "REFUNDED" });
        expect(calls.refunds).toHaveLength(1);
      } else {
        expect(payment).toMatchObject({ outcome: "CONFIRMED" });
        expect(newcomer).toMatchObject({ code: "SEATS_TAKEN" });
        expect(calls.refunds).toHaveLength(0);
      }
    }
  });

  it("does not know other sessions", async () => {
    const { provider } = await setup();
    expect(await confirmPayment(db, provider, { sessionId: "cs_unknown", paymentId: "pi_1" })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });
});

describe("cancelBooking with payments", () => {
  it("expires the checkout when a hold is released, so it cannot be paid afterwards", async () => {
    const { holdAndCheckout, seats, provider, organization, calls, takenAt } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);

    const result = await cancelBooking(db, provider, {
      organizationId: organization.id,
      reference: booking.reference,
      customerEmail: customer.customerEmail,
    });

    expect(result).toMatchObject({ ok: true, refunded: false });
    expect(calls.expired).toEqual([booking.sessionId]);
    expect(await takenAt(new Date())).toEqual([]);
  });

  it("refunds a paid booking when it is cancelled", async () => {
    const { holdAndCheckout, seats, provider, organization, calls } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);
    await confirmPayment(db, provider, { sessionId: booking.sessionId, paymentId: "pi_1" });

    const result = await cancelBooking(db, provider, {
      organizationId: organization.id,
      reference: booking.reference,
      customerEmail: customer.customerEmail,
    });

    expect(result).toMatchObject({ ok: true, refunded: true });
    expect(calls.refunds).toEqual([{ paymentId: "pi_1", idempotencyKey: expect.stringMatching(/^refund-/) }]);
    const stored = await db.booking.findUniqueOrThrow({ where: { reference: booking.reference } });
    expect(stored).toMatchObject({ status: "CANCELLED", refundedAt: expect.any(Date) });
  });
});

describe("syncCheckout", () => {
  it("confirms a booking whose payment the provider reports, for a customer back before the webhook", async () => {
    const { holdAndCheckout, seats, provider, organization, pay, status } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);
    const command = { organizationId: organization.id, reference: booking.reference };

    expect(await syncCheckout(db, provider, command)).toBeNull();
    pay(booking.sessionId);
    expect(await syncCheckout(db, provider, command)).toMatchObject({ outcome: "CONFIRMED" });
    expect(await status(booking.reference)).toBe("CONFIRMED");
  });
});

describe("handleStripeEvent", () => {
  // The fields of a Stripe event that the handler reads.
  const stripeEvent = (type: string, session: Partial<Stripe.Checkout.Session>) =>
    ({
      id: `evt_${Math.random()}`,
      type,
      data: { object: { object: "checkout.session", ...session } },
    }) as Stripe.Event;

  it("confirms a paid checkout, and ignores a second delivery of the same event", async () => {
    const { holdAndCheckout, seats, provider, status, event } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);
    const completed = stripeEvent("checkout.session.completed", {
      id: booking.sessionId,
      payment_status: "paid",
      payment_intent: "pi_1",
    });

    expect(await handleStripeEvent(db, provider, completed)).toEqual({ eventId: event.id });
    expect(await handleStripeEvent(db, provider, completed)).toEqual({ eventId: event.id });
    expect(await status(booking.reference)).toBe("CONFIRMED");
  });

  it("waits for async_payment_succeeded when a delayed payment method completes unpaid", async () => {
    const { holdAndCheckout, seats, provider, status } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);

    await handleStripeEvent(
      db,
      provider,
      stripeEvent("checkout.session.completed", { id: booking.sessionId, payment_status: "unpaid" }),
    );
    expect(await status(booking.reference)).toBe("PENDING");

    await handleStripeEvent(
      db,
      provider,
      stripeEvent("checkout.session.async_payment_succeeded", {
        id: booking.sessionId,
        payment_status: "paid",
        payment_intent: "pi_1",
      }),
    );
    expect(await status(booking.reference)).toBe("CONFIRMED");
  });

  it("releases the seats when the checkout expires", async () => {
    const { holdAndCheckout, seats, provider, status, takenAt } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);

    await handleStripeEvent(db, provider, stripeEvent("checkout.session.expired", { id: booking.sessionId }));

    expect(await status(booking.reference)).toBe("EXPIRED");
    expect(await takenAt(new Date())).toEqual([]);
  });

  it("ignores sessions it does not know and event types it does not handle", async () => {
    const { provider } = await setup();

    expect(
      await handleStripeEvent(
        db,
        provider,
        stripeEvent("checkout.session.completed", { id: "cs_other", payment_status: "paid", payment_intent: "pi_x" }),
      ),
    ).toBeNull();
    expect(await handleStripeEvent(db, provider, stripeEvent("customer.created", {}))).toBeNull();
  });
});

describe("cancelBooking while the customer is paying", () => {
  it("records a payment that completed just before the hold was released, and refunds it", async () => {
    const { holdAndCheckout, seats, provider, organization, pay, status, calls } = await setup();
    const booking = await holdAndCheckout([seats[0].id]);
    // Paid on the provider's page, but no webhook has arrived yet.
    pay(booking.sessionId, "pi_just_now");

    const result = await cancelBooking(db, provider, {
      organizationId: organization.id,
      reference: booking.reference,
      customerEmail: customer.customerEmail,
    });

    expect(result).toMatchObject({ ok: true, refunded: true });
    expect(await status(booking.reference)).toBe("CANCELLED");
    expect(calls.refunds).toEqual([{ paymentId: "pi_just_now", idempotencyKey: expect.stringMatching(/^refund-/) }]);
  });
});
