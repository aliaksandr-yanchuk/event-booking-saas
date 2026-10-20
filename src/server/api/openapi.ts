import { z } from "zod";
import { requestSchemas, responseSchemas } from "@/server/api/schemas";

/**
 * Builds the OpenAPI 3.1 document. Every request and response schema is generated
 * from the Zod schemas in schemas.ts; this file only describes the routes.
 */

const SCHEMA_PREFIX = "#/components/schemas/";
const ref = (id: string) => ({ $ref: `${SCHEMA_PREFIX}${id}` });
const json = (id: string, contentType = "application/json") => ({ content: { [contentType]: { schema: ref(id) } } });

const problemResponse = (description: string) => ({ description, ...json("Problem", "application/problem+json") });

const rateLimitedResponse = {
  ...problemResponse("Too many attempts from this client, or for this booking (RATE_LIMITED)"),
  headers: { "Retry-After": { description: "Seconds until the next attempt is allowed", schema: { type: "integer" } } },
};

const pathParam = (name: string, example: string, pattern?: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", ...(pattern && { pattern }) },
  example,
});
const org = pathParam("org", "harbor-hall");
const event = pathParam("event", "midnight-jazz-session");
const reference = pathParam("reference", "7KQM-4XPA", "^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$");
const idempotencyKey = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description:
    "Makes the request safe to retry. A retry with the same key and body returns the original " +
    "booking (with Idempotent-Replayed: true) instead of booking again. Use a new UUID per booking.",
  schema: { type: "string", minLength: 1, maxLength: 255 },
  example: "8e03978e-40d5-43e8-bc93-6894a57f9324",
};

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Seatline API",
      version: "1.0.0",
      description:
        "Public API for browsing events and booking reserved seats. " +
        "Prices are integers in the currency's minor unit. Errors use RFC 9457 Problem Details.",
    },
    paths: {
      "/api/v1/organizations/{org}/events": {
        get: {
          operationId: "listEvents",
          summary: "List upcoming events of an organizer",
          parameters: [org],
          responses: {
            200: { description: "Upcoming published events", ...json("EventListResponse") },
            404: problemResponse("Unknown organizer"),
          },
        },
      },
      "/api/v1/organizations/{org}/events/{event}": {
        get: {
          operationId: "getEvent",
          summary: "Get an event with live seat availability",
          parameters: [org, event],
          responses: {
            200: { description: "Event details and seat map", ...json("EventDetailResponse") },
            404: problemResponse("Unknown organizer or event"),
          },
        },
      },
      "/api/v1/organizations/{org}/events/{event}/bookings": {
        post: {
          operationId: "createBooking",
          summary: "Book seats",
          parameters: [org, event, idempotencyKey],
          requestBody: { required: true, ...json("CreateBookingRequest") },
          responses: {
            201: {
              description: "Booking confirmed",
              headers: {
                Location: { description: "API URL of the new booking", schema: { type: "string" } },
                "Idempotent-Replayed": {
                  description: "Present (true) when this is the stored result of an earlier request with the same key",
                  schema: { type: "string", enum: ["true"] },
                },
              },
              ...json("BookingCreatedResponse"),
            },
            400: problemResponse("Invalid body or Idempotency-Key (VALIDATION_FAILED, INVALID_JSON)"),
            404: problemResponse("Unknown organizer or event"),
            409: problemResponse("A seat is already booked (SEATS_TAKEN)"),
            415: problemResponse("Body is not application/json"),
            422: problemResponse(
              "A booking rule was broken (TOO_MANY_SEATS, INVALID_SEATS, EVENT_NOT_BOOKABLE), " +
                "or the Idempotency-Key was used for a different request (IDEMPOTENCY_KEY_REUSED)",
            ),
            429: rateLimitedResponse,
          },
        },
      },
      "/api/v1/organizations/{org}/bookings/{reference}": {
        get: {
          operationId: "getBooking",
          summary: "Get a booking by its reference",
          parameters: [org, reference],
          responses: {
            200: { description: "The booking, without the customer's email", ...json("BookingDetailsResponse") },
            404: problemResponse("Unknown booking"),
          },
        },
      },
      "/api/v1/organizations/{org}/bookings/{reference}/cancel": {
        post: {
          operationId: "cancelBooking",
          summary: "Cancel a booking and release its seats",
          parameters: [org, reference],
          requestBody: { required: true, ...json("CancelBookingRequest") },
          responses: {
            200: { description: "Booking cancelled", ...json("BookingCancelledResponse") },
            400: problemResponse("Invalid body"),
            404: problemResponse("No booking with this reference and email"),
            409: problemResponse("Already cancelled (ALREADY_CANCELLED)"),
            415: problemResponse("Body is not application/json"),
            422: problemResponse("The event has started (EVENT_STARTED)"),
            429: rateLimitedResponse,
          },
        },
      },
    },
    components: {
      schemas: {
        // Requests are documented as clients send them (before trim/lowercase),
        // responses as the server returns them.
        ...generate(requestSchemas, "input"),
        ...generate(responseSchemas, "output"),
      },
    },
  };
}

function generate(registry: typeof responseSchemas, io: "input" | "output") {
  const { schemas } = z.toJSONSchema(registry, { io, uri: (id) => `${SCHEMA_PREFIX}${id}` });
  return Object.fromEntries(Object.entries(schemas).map(([id, schema]) => [id, simplify(schema)]));
}

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/**
 * Removes generator noise that makes the document hard to read without adding
 * information for clients: per-schema $schema/$id, the long regex Zod attaches
 * to date-time strings (format already says it), and safe-integer bounds.
 */
function simplify(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(simplify);
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema" || key === "$id") continue;
    if (key === "pattern" && (node as { format?: string }).format === "date-time") continue;
    if ((key === "minimum" && value === -MAX_SAFE) || (key === "maximum" && value === MAX_SAFE)) continue;
    result[key] = simplify(value);
  }
  return result;
}
