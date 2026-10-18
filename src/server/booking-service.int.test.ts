import { cancelBooking, createBooking } from "@/server/booking-service";
import type { Db } from "@/server/db";
import { findPublicEvent, getSeatMap } from "@/server/repositories/events";
import {
  createEventWithSeats,
  createOrganization,
  createTestDb,
  customer,
  resetDatabase,
} from "../../test/integration/factories";

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

describe("createBooking", () => {
  it("books the seats, totals the price and marks the seats as taken", async () => {
    const organization = await createOrganization(db);
    const { event, seats } = await createEventWithSeats(db, organization.id, { priceMinor: 4000 });

    const result = await createBooking(db, {
      ...customer,
      organizationId: organization.id,
      eventId: event.id,
      seatIds: [seats[0].id, seats[1].id],
    });

    expect(result).toMatchObject({ ok: true, totalMinor: 8000 });
    const booking = await db.booking.findFirstOrThrow({ where: { eventId: event.id } });
    expect(booking.seatLabels).toEqual(["Floor · Row A · Seat 1", "Floor · Row A · Seat 2"]);

    const seatMap = await getSeatMap(db, event.id);
    const taken = seatMap[0].seats.filter((seat) => seat.taken).map((seat) => seat.number);
    expect(taken).toEqual([1, 2]);
  });

  it("rejects seats that are already booked", async () => {
    const organization = await createOrganization(db);
    const { event, seats } = await createEventWithSeats(db, organization.id);
    const command = { ...customer, organizationId: organization.id, eventId: event.id };

    await createBooking(db, { ...command, seatIds: [seats[0].id] });
    const second = await createBooking(db, { ...command, seatIds: [seats[0].id, seats[1].id] });

    expect(second).toEqual({ ok: false, code: "SEATS_TAKEN", takenSeatIds: [seats[0].id] });
    expect(await db.booking.count()).toBe(1);
  });

  it("lets exactly one of many simultaneous requests win the same seat", async () => {
    const organization = await createOrganization(db);
    const { event, seats } = await createEventWithSeats(db, organization.id);

    // Ten customers click "Book" on the same seat at the same moment. All of them
    // pass the "is it free?" check; the UNIQUE constraint decides the winner.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createBooking(db, {
          customerName: `Customer ${i}`,
          customerEmail: `customer${i}@example.com`,
          organizationId: organization.id,
          eventId: event.id,
          seatIds: [seats[0].id],
        }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual(
      Array(9).fill({ ok: false, code: "SEATS_TAKEN", takenSeatIds: [seats[0].id] }),
    );
    expect(await db.bookingSeat.count()).toBe(1);
    // The losing transactions rolled back completely: no orphaned booking rows.
    expect(await db.booking.count()).toBe(1);
  });

  it("rejects seat IDs that belong to another event", async () => {
    const organization = await createOrganization(db);
    const { event } = await createEventWithSeats(db, organization.id);
    const other = await createEventWithSeats(db, organization.id);

    const result = await createBooking(db, {
      ...customer,
      organizationId: organization.id,
      eventId: event.id,
      seatIds: [other.seats[0].id],
    });

    expect(result).toEqual({ ok: false, code: "INVALID_SEATS" });
  });

  it("does not let one tenant book another tenant's event", async () => {
    const owner = await createOrganization(db);
    const intruder = await createOrganization(db);
    const { event, seats } = await createEventWithSeats(db, owner.id);

    const result = await createBooking(db, {
      ...customer,
      organizationId: intruder.id,
      eventId: event.id,
      seatIds: [seats[0].id],
    });

    expect(result).toEqual({ ok: false, code: "EVENT_NOT_BOOKABLE" });
  });

  it.each([
    ["a draft", { status: "DRAFT" as const }],
    ["a cancelled event", { status: "CANCELLED" as const }],
    ["an event that already started", { startsAt: new Date(Date.now() - 60_000) }],
  ])("refuses bookings for %s", async (_label, options) => {
    const organization = await createOrganization(db);
    const { event, seats } = await createEventWithSeats(db, organization.id, options);

    const result = await createBooking(db, {
      ...customer,
      organizationId: organization.id,
      eventId: event.id,
      seatIds: [seats[0].id],
    });

    expect(result).toEqual({ ok: false, code: "EVENT_NOT_BOOKABLE" });
  });

  it("enforces the per-event seat limit", async () => {
    const organization = await createOrganization(db);
    const { event, seats } = await createEventWithSeats(db, organization.id, { maxSeatsPerBooking: 2 });

    const result = await createBooking(db, {
      ...customer,
      organizationId: organization.id,
      eventId: event.id,
      seatIds: seats.slice(0, 3).map((seat) => seat.id),
    });

    expect(result).toEqual({ ok: false, code: "TOO_MANY_SEATS", limit: 2 });
  });
});

describe("cancelBooking", () => {
  async function bookOneSeat() {
    const organization = await createOrganization(db);
    const { event, seats } = await createEventWithSeats(db, organization.id);
    const result = await createBooking(db, {
      ...customer,
      organizationId: organization.id,
      eventId: event.id,
      seatIds: [seats[0].id],
    });
    if (!result.ok) throw new Error("setup failed");
    return { organization, event, seats, reference: result.reference };
  }

  it("cancels the booking and puts the seat back on sale", async () => {
    const { organization, event, seats, reference } = await bookOneSeat();

    const result = await cancelBooking(db, {
      organizationId: organization.id,
      reference,
      customerEmail: " AIKO@example.com ",
    });

    expect(result).toEqual({ ok: true, eventId: event.id });
    expect(await db.booking.findUnique({ where: { reference } })).toMatchObject({ status: "CANCELLED" });

    const rebooked = await createBooking(db, {
      customerName: "Ken Sato",
      customerEmail: "ken@example.com",
      organizationId: organization.id,
      eventId: event.id,
      seatIds: [seats[0].id],
    });
    expect(rebooked.ok).toBe(true);
  });

  it("requires the email used for the booking", async () => {
    const { organization, reference } = await bookOneSeat();

    const result = await cancelBooking(db, {
      organizationId: organization.id,
      reference,
      customerEmail: "someone-else@example.com",
    });

    expect(result).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("cannot cancel twice", async () => {
    const { organization, reference } = await bookOneSeat();
    const command = { organizationId: organization.id, reference, customerEmail: customer.customerEmail };

    await cancelBooking(db, command);
    expect(await cancelBooking(db, command)).toEqual({ ok: false, code: "ALREADY_CANCELLED" });
  });

  it("cannot cancel once the event has started", async () => {
    const { organization, event, reference } = await bookOneSeat();

    const result = await cancelBooking(
      db,
      { organizationId: organization.id, reference, customerEmail: customer.customerEmail },
      { now: new Date(event.startsAt.getTime() + 1) },
    );

    expect(result).toEqual({ ok: false, code: "EVENT_STARTED" });
  });
});

describe("findPublicEvent", () => {
  it("only finds events within the given tenant", async () => {
    const harbor = await createOrganization(db, "harbor");
    const kyoto = await createOrganization(db, "kyoto");
    await createEventWithSeats(db, harbor.id, { slug: "summer-live" });

    expect(await findPublicEvent(db, harbor.id, "summer-live")).not.toBeNull();
    expect(await findPublicEvent(db, kyoto.id, "summer-live")).toBeNull();
  });

  it("allows the same slug in two tenants", async () => {
    const harbor = await createOrganization(db, "harbor");
    const kyoto = await createOrganization(db, "kyoto");
    await createEventWithSeats(db, harbor.id, { slug: "summer-live" });
    await createEventWithSeats(db, kyoto.id, { slug: "summer-live" });

    const [a, b] = await Promise.all([
      findPublicEvent(db, harbor.id, "summer-live"),
      findPublicEvent(db, kyoto.id, "summer-live"),
    ]);
    expect(a?.organizationSlug).toBe("harbor");
    expect(b?.organizationSlug).toBe("kyoto");
  });

  it("hides drafts", async () => {
    const organization = await createOrganization(db);
    await createEventWithSeats(db, organization.id, { slug: "secret", status: "DRAFT" });

    expect(await findPublicEvent(db, organization.id, "secret")).toBeNull();
  });
});
