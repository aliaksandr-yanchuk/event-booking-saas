import { expect, test, type APIRequestContext } from "@playwright/test";

// Runs in the "api" project: plain HTTP requests against the running server, no browser.
// Uses seats the UI tests never touch (Autumn Strings, section A, rows G–H).

const EVENT = "/api/v1/organizations/kyoto-chamber/events/autumn-strings";

type Seat = { id: string; row: string; number: number; available: boolean };
type Section = { name: string; priceMinor: number; seats: Seat[] };

async function seatId(request: APIRequestContext, section: string, row: string, number: number) {
  const response = await request.get(EVENT);
  const { data } = await response.json();
  const seat = (data.sections as Section[])
    .find((s) => s.name === section)
    ?.seats.find((s) => s.row === row && s.number === number);
  if (!seat) throw new Error(`Seat ${section} ${row}${number} not found`);
  return seat;
}

function book(request: APIRequestContext, seatIds: string[], email = "api@example.com") {
  return request.post(`${EVENT}/bookings`, {
    data: { customerName: "API Client", customerEmail: email, seatIds },
  });
}

test("lists an organizer's upcoming events", async ({ request }) => {
  const response = await request.get("/api/v1/organizations/kyoto-chamber/events");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("max-age=60");
  const body = await response.json();
  expect(body.organizer).toEqual({ slug: "kyoto-chamber", name: "Kyoto Chamber Orchestra" });
  // The cancelled New Year Concert is not "upcoming".
  expect(body.data.map((event: { slug: string }) => event.slug)).toEqual(["autumn-strings"]);
  expect(body.data[0].priceRange).toEqual({ currency: "JPY", minMinor: 6000, maxMinor: 9000 });
});

test("returns event details with live availability, never cached", async ({ request }) => {
  const response = await request.get(EVENT);

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const { data } = await response.json();
  expect(data).toMatchObject({ slug: "autumn-strings", status: "published", currency: "JPY", maxSeatsPerBooking: 6 });
  // Seeded booking: section S, row B, seats 6–9.
  const taken = (data.sections as Section[])
    .flatMap((section) => section.seats.filter((seat) => !seat.available).map((seat) => `${section.name}${seat.row}${seat.number}`));
  expect(taken).toEqual(expect.arrayContaining(["SB6", "SB7", "SB8", "SB9"]));
});

test("books seats, then fetches and cancels the booking", async ({ request }) => {
  const seat = await seatId(request, "A", "G", 1);
  expect(seat.available).toBe(true);

  const created = await book(request, [seat.id]);
  expect(created.status()).toBe(201);
  const { data: booking } = await created.json();
  expect(booking).toMatchObject({ status: "confirmed", totalMinor: 6000, currency: "JPY", seatIds: [seat.id] });
  expect(created.headers()["location"]).toBe(`/api/v1/organizations/kyoto-chamber/bookings/${booking.reference}`);

  const fetched = await request.get(created.headers()["location"]);
  expect(fetched.status()).toBe(200);
  const { data: details } = await fetched.json();
  expect(details).toMatchObject({ reference: booking.reference, status: "confirmed", seats: ["A · Row G · Seat 1"] });
  expect(details).not.toHaveProperty("customerEmail");

  expect((await seatId(request, "A", "G", 1)).available).toBe(false);

  const wrongEmail = await request.post(`${created.headers()["location"]}/cancel`, {
    data: { customerEmail: "someone@example.com" },
  });
  expect(wrongEmail.status()).toBe(404);

  const cancelled = await request.post(`${created.headers()["location"]}/cancel`, {
    data: { customerEmail: "API@example.com" },
  });
  expect(cancelled.status()).toBe(200);
  expect((await seatId(request, "A", "G", 1)).available).toBe(true);

  const again = await request.post(`${created.headers()["location"]}/cancel`, {
    data: { customerEmail: "api@example.com" },
  });
  expect(again.status()).toBe(409);
  expect((await again.json()).code).toBe("ALREADY_CANCELLED");
});

test("only one of several simultaneous requests gets the same seat", async ({ request }) => {
  const seat = await seatId(request, "A", "H", 14);

  const responses = await Promise.all(
    Array.from({ length: 5 }, (_, i) => book(request, [seat.id], `racer${i}@example.com`)),
  );

  const statuses = responses.map((response) => response.status()).sort();
  expect(statuses).toEqual([201, 409, 409, 409, 409]);
  const conflict = await responses.find((response) => response.status() === 409)!.json();
  expect(conflict).toMatchObject({ status: 409, code: "SEATS_TAKEN", takenSeatIds: [seat.id] });
});

test("rejects invalid bodies with field errors (RFC 9457)", async ({ request }) => {
  const response = await request.post(`${EVENT}/bookings`, {
    data: { customerName: "", customerEmail: "not-an-email", seatIds: [] },
  });

  expect(response.status()).toBe(400);
  expect(response.headers()["content-type"]).toContain("application/problem+json");
  expect(await response.json()).toMatchObject({
    status: 400,
    code: "VALIDATION_FAILED",
    errors: {
      customerName: "Enter your name.",
      customerEmail: "Enter a valid email address, like name@example.com.",
      seatIds: "Choose at least one seat.",
    },
  });
});

test("rejects malformed JSON and other content types", async ({ request }) => {
  const malformed = await request.post(`${EVENT}/bookings`, {
    headers: { "Content-Type": "application/json" },
    // A Buffer is sent as-is; a plain string would be JSON-encoded into a valid JSON string.
    data: Buffer.from("{ not json"),
  });
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).code).toBe("INVALID_JSON");

  const form = await request.post(`${EVENT}/bookings`, { form: { customerName: "x" } });
  expect(form.status()).toBe(415);
});

test("enforces booking rules with 422", async ({ request }) => {
  const { data } = await (await request.get(EVENT)).json();
  const sevenSeats = (data.sections as Section[])
    .find((section) => section.name === "A")!
    .seats.filter((seat) => seat.row === "G" && seat.number >= 2 && seat.number <= 8)
    .map((seat) => seat.id);

  const response = await book(request, sevenSeats);
  expect(response.status()).toBe(422);
  expect(await response.json()).toMatchObject({ code: "TOO_MANY_SEATS", limit: 6 });

  const foreignSeat = await book(request, ["evt_midnight-jazz-session_Floor_E1"]);
  expect(foreignSeat.status()).toBe(422);
  expect((await foreignSeat.json()).code).toBe("INVALID_SEATS");
});

test("does not leak events across tenants or show drafts", async ({ request }) => {
  const otherTenant = await request.get("/api/v1/organizations/kyoto-chamber/events/midnight-jazz-session");
  expect(otherTenant.status()).toBe(404);

  const draft = await request.get("/api/v1/organizations/harbor-hall/events/winter-gala");
  expect(draft.status()).toBe(404);

  const unknownOrg = await request.get("/api/v1/organizations/nope/events");
  expect((await unknownOrg.json()).code).toBe("NOT_FOUND");
});

test("serves an OpenAPI document generated from the validation schema", async ({ request }) => {
  const response = await request.get("/api/v1/openapi.json");

  expect(response.status()).toBe(200);
  const spec = await response.json();
  expect(spec.openapi).toBe("3.1.0");
  const bookingSchema =
    spec.paths["/api/v1/organizations/{org}/events/{event}/bookings"].post.requestBody.content["application/json"].schema;
  expect(bookingSchema.required).toEqual(["customerName", "customerEmail", "seatIds"]);
  expect(bookingSchema.properties.customerName.maxLength).toBe(80);
});
