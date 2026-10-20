import { createBooking } from "@/server/booking-service";
import type { Db } from "@/server/db";
import { confirmPayment, startCheckout } from "@/server/payment-service";
import { HOLD_TTL_MS } from "@/server/payments/provider";
import { checkInBooking, listEventBookings, listEventSales } from "@/server/repositories/dashboard";
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

const now = new Date();
const { provider } = createFakePayments();

async function setup() {
  const organization = await createOrganization(db);
  const { event, seats } = await createEventWithSeats(db, organization.id, { priceMinor: 5000, seats: 10 });
  const user = await db.user.create({
    data: { email: `door${Math.random()}@example.com`, name: "Taro", passwordHash: "x" },
  });

  async function book(seatIndexes: number[], options: { pay?: boolean; name?: string } = {}) {
    const result = await createBooking(db, {
      customerName: options.name ?? customer.customerName,
      customerEmail: customer.customerEmail,
      organizationId: organization.id,
      eventId: event.id,
      seatIds: seatIndexes.map((i) => seats[i].id),
    });
    if (!result.ok) throw new Error(result.code);
    if (options.pay) {
      await startCheckout(db, provider, {
        organizationId: organization.id,
        reference: result.reference,
        successUrl: "https://x.example/s",
        cancelUrl: "https://x.example/c",
      });
      const { checkoutSessionId } = await db.booking.findUniqueOrThrow({ where: { reference: result.reference } });
      await confirmPayment(db, provider, { sessionId: checkoutSessionId!, paymentId: `pi_${result.reference}` });
    }
    return result.reference;
  }

  return { organization, event, user, book };
}

describe("listEventSales", () => {
  it("counts sold and held seats and the revenue of confirmed bookings only", async () => {
    const { organization, event, book } = await setup();
    await book([0, 1], { pay: true });
    await book([2]); // held, not paid
    const expired = await book([3]);
    await db.booking.update({ where: { reference: expired }, data: { expiresAt: new Date(now.getTime() - 1) } });

    const [sales] = await listEventSales(db, organization.id, now);

    expect(sales).toMatchObject({ id: event.id, capacity: 10, sold: 2, held: 1, revenueMinor: 10000, checkedIn: 0 });
  });

  it("only lists the organizer's own events", async () => {
    const mine = await setup();
    await setup();

    const sales = await listEventSales(db, mine.organization.id, now);

    expect(sales.map((event) => event.id)).toEqual([mine.event.id]);
  });
});

describe("listEventBookings", () => {
  it("filters by status as the customer sees it, and by name or reference", async () => {
    const { organization, event, book } = await setup();
    const paid = await book([0], { pay: true, name: "Aiko Tanaka" });
    const held = await book([1], { name: "Ken Sato" });
    const ranOut = await book([2], { name: "Yui Kato" });
    await db.booking.update({ where: { reference: ranOut }, data: { expiresAt: new Date(now.getTime() - 1) } });

    const list = (filter: Parameters<typeof listEventBookings>[3]) =>
      listEventBookings(db, organization.id, event.id, filter, now).then((rows) => rows.map((row) => row.reference));

    expect(await list({ status: "CONFIRMED" })).toEqual([paid]);
    expect(await list({ status: "PENDING" })).toEqual([held]);
    expect(await list({ status: "EXPIRED" })).toEqual([ranOut]);
    expect(await list({ search: "ken" })).toEqual([held]);
    expect(await list({ search: paid.slice(0, 4).toLowerCase() })).toEqual([paid]);
  });
});

describe("checkInBooking", () => {
  it("lets a confirmed booking in exactly once, even when two staff scan it at the same moment", async () => {
    const { organization, user, book } = await setup();
    const reference = await book([0], { pay: true });
    const command = { organizationId: organization.id, reference, userId: user.id };

    const results = await Promise.all([checkInBooking(db, command), checkInBooking(db, command)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ code: "ALREADY_CHECKED_IN", by: "Taro" });
  });

  it("refuses bookings that are not confirmed, and bookings of other organizers", async () => {
    const { organization, user, book } = await setup();
    const other = await setup();
    const held = await book([0]);
    const paid = await book([1], { pay: true });

    expect(await checkInBooking(db, { organizationId: organization.id, reference: held, userId: user.id })).toEqual({
      ok: false,
      code: "NOT_CONFIRMED",
    });
    expect(
      await checkInBooking(db, { organizationId: other.organization.id, reference: paid, userId: other.user.id }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("does not let an expired hold in", async () => {
    const { organization, user, book } = await setup();
    const reference = await book([0]);
    await db.booking.update({ where: { reference }, data: { expiresAt: new Date(now.getTime() - HOLD_TTL_MS) } });

    expect(await checkInBooking(db, { organizationId: organization.id, reference, userId: user.id })).toMatchObject({
      code: "NOT_CONFIRMED",
    });
  });
});
