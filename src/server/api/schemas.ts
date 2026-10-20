import { z } from "zod";
import { bookingInputSchema } from "@/lib/booking-input";

/**
 * The public API contract, defined once in Zod and used three ways:
 * - TypeScript: serializers and route handlers must return these exact shapes
 * - OpenAPI: /api/v1/openapi.json is generated from these schemas
 * - Contract tests: the API tests parse real responses with them
 *
 * Response objects are strict, so a field added by mistake fails the contract
 * tests instead of silently becoming part of the public API.
 */

type SchemaMeta = { id: string; description?: string };

/** Schemas of response bodies (OpenAPI components, generated in "output" mode). */
export const responseSchemas = z.registry<SchemaMeta>();
/** Schemas of request bodies (generated in "input" mode, before transforms such as trim). */
export const requestSchemas = z.registry<SchemaMeta>();

const isoDateTime = z.iso.datetime();
const minorUnits = z.int().nonnegative().describe("Amount in the currency's minor unit (JPY: 1 = ¥1)");
const currency = z.string().length(3).describe("ISO 4217 currency code");

// ---- Problem Details (errors) ----

export const PROBLEM_CODES = [
  "VALIDATION_FAILED",
  "INVALID_JSON",
  "UNSUPPORTED_MEDIA_TYPE",
  "NOT_FOUND",
  "SEATS_TAKEN",
  "TOO_MANY_SEATS",
  "INVALID_SEATS",
  "EVENT_NOT_BOOKABLE",
  "ALREADY_CANCELLED",
  "EVENT_STARTED",
  "IDEMPOTENCY_KEY_REUSED",
  "RATE_LIMITED",
] as const;

export const Problem = z
  .strictObject({
    type: z.string(),
    title: z.string(),
    status: z.int(),
    code: z.enum(PROBLEM_CODES),
    detail: z.string().optional(),
    errors: z.record(z.string(), z.string()).optional().describe("Message per invalid field"),
    takenSeatIds: z.array(z.string()).optional().describe("With SEATS_TAKEN: the seats that are already booked"),
    limit: z.int().optional().describe("With TOO_MANY_SEATS: the maximum seats per booking"),
  })
  .register(responseSchemas, { id: "Problem", description: "RFC 9457 Problem Details" });

// ---- Shared pieces ----

export const Organizer = z
  .strictObject({ slug: z.string(), name: z.string() })
  .register(responseSchemas, { id: "Organizer" });

export const VenueSummary = z
  .strictObject({ name: z.string(), city: z.string() })
  .register(responseSchemas, { id: "VenueSummary" });

export const Venue = z
  .strictObject({ name: z.string(), address: z.string(), city: z.string(), country: z.string().length(2) })
  .register(responseSchemas, { id: "Venue" });

export const Seat = z
  .strictObject({ id: z.string(), row: z.string(), number: z.int().positive(), available: z.boolean() })
  .register(responseSchemas, { id: "Seat" });

export const Section = z
  .strictObject({ name: z.string(), priceMinor: minorUnits, seats: z.array(Seat) })
  .register(responseSchemas, { id: "Section" });

// ---- Events ----

export const EventSummary = z
  .strictObject({
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    startsAt: isoDateTime,
    venue: VenueSummary,
    priceRange: z
      .strictObject({ currency, minMinor: minorUnits, maxMinor: minorUnits })
      .nullable()
      .describe("null when the event has no priced sections"),
    links: z.strictObject({ self: z.string() }),
  })
  .register(responseSchemas, { id: "EventSummary" });

export const EventListResponse = z
  .strictObject({ organizer: Organizer, data: z.array(EventSummary) })
  .register(responseSchemas, { id: "EventListResponse" });

export const EventDetail = z
  .strictObject({
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    description: z.string(),
    status: z.enum(["published", "cancelled"]),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    currency,
    maxSeatsPerBooking: z.int().positive(),
    organizer: Organizer,
    venue: Venue,
    seatsLeft: z.int().nonnegative(),
    sections: z.array(Section),
  })
  .register(responseSchemas, { id: "EventDetail" });

export const EventDetailResponse = z
  .strictObject({ data: EventDetail })
  .register(responseSchemas, { id: "EventDetailResponse" });

// ---- Bookings ----

const bookingLinks = z.strictObject({
  self: z.string().describe("API URL of the booking"),
  page: z.string().describe("Web page of the booking"),
});

export const BookingCreatedResponse = z
  .strictObject({
    data: z.strictObject({
      reference: z.string(),
      status: z.literal("confirmed"),
      totalMinor: minorUnits,
      currency,
      seatIds: z.array(z.string()),
      links: bookingLinks,
    }),
  })
  .register(responseSchemas, { id: "BookingCreatedResponse" });

export const BookingDetailsResponse = z
  .strictObject({
    data: z.strictObject({
      reference: z.string(),
      status: z.enum(["confirmed", "cancelled"]),
      customerName: z.string(),
      seats: z.array(z.string()).describe("Seat labels, copied at booking time"),
      totalMinor: minorUnits,
      currency,
      createdAt: isoDateTime,
      cancelledAt: isoDateTime.nullable(),
      event: z.strictObject({ slug: z.string(), title: z.string(), startsAt: isoDateTime, venue: VenueSummary }),
    }),
  })
  .register(responseSchemas, { id: "BookingDetailsResponse" });

export const BookingCancelledResponse = z
  .strictObject({ data: z.strictObject({ reference: z.string(), status: z.literal("cancelled") }) })
  .register(responseSchemas, { id: "BookingCancelledResponse" });

// ---- Request bodies ----

bookingInputSchema.register(requestSchemas, { id: "CreateBookingRequest" });

export const CancelBookingRequest = z
  .object({
    customerEmail: z
      .string()
      .meta({ format: "email" })
      .trim()
      .pipe(z.email("Enter the email address used for the booking.")),
  })
  .register(requestSchemas, { id: "CancelBookingRequest" });

// ---- Typed JSON responses ----

/**
 * Response.json with a compile-time check: `body` must match `schema`, so a
 * serializer that drifts from the documented contract does not type-check.
 */
export function jsonResponse<S extends z.ZodType>(_schema: S, body: z.output<S>, init?: ResponseInit): Response {
  return Response.json(body, init);
}
