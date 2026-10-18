import { z } from "zod";
import { bookingInputSchema } from "@/lib/booking-input";

/**
 * GET /api/v1/openapi.json — OpenAPI 3.1 description of the public API.
 * The booking request schema is generated from the same Zod schema the server
 * validates with, so the documented contract cannot drift from the real one.
 * Contains no runtime data, so Next.js prerenders it at build time.
 */
export function GET() {
  return Response.json(openApiDocument);
}

const problem = {
  description: "Problem Details (RFC 9457)",
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
};
const orgParam = { name: "org", in: "path", required: true, schema: { type: "string" }, example: "harbor-hall" };
const eventParam = {
  name: "event",
  in: "path",
  required: true,
  schema: { type: "string" },
  example: "midnight-jazz-session",
};
const referenceParam = {
  name: "reference",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$" },
};

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Seatline API",
    version: "1.0.0",
    description:
      "Public API for browsing events and booking reserved seats. Prices are integers in the currency's minor unit.",
  },
  paths: {
    "/api/v1/organizations/{org}/events": {
      get: {
        summary: "List upcoming events of an organizer",
        parameters: [orgParam],
        responses: { 200: { description: "Upcoming published events" }, 404: problem },
      },
    },
    "/api/v1/organizations/{org}/events/{event}": {
      get: {
        summary: "Get an event with live seat availability",
        parameters: [orgParam, eventParam],
        responses: { 200: { description: "Event details and seat map" }, 404: problem },
      },
    },
    "/api/v1/organizations/{org}/events/{event}/bookings": {
      post: {
        summary: "Book seats",
        parameters: [orgParam, eventParam],
        requestBody: {
          required: true,
          content: { "application/json": { schema: z.toJSONSchema(bookingInputSchema, { io: "input" }) } },
        },
        responses: {
          201: {
            description: "Booking confirmed. The Location header points to the booking.",
            headers: { Location: { schema: { type: "string" } } },
          },
          400: problem,
          404: problem,
          409: { ...problem, description: "One or more seats are already booked (code SEATS_TAKEN)" },
          415: problem,
          422: { ...problem, description: "A booking rule was broken (TOO_MANY_SEATS, INVALID_SEATS, EVENT_NOT_BOOKABLE)" },
        },
      },
    },
    "/api/v1/organizations/{org}/bookings/{reference}": {
      get: {
        summary: "Get a booking by its reference",
        parameters: [orgParam, referenceParam],
        responses: { 200: { description: "The booking (without the customer's email)" }, 404: problem },
      },
    },
    "/api/v1/organizations/{org}/bookings/{reference}/cancel": {
      post: {
        summary: "Cancel a booking",
        parameters: [orgParam, referenceParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["customerEmail"],
                properties: { customerEmail: { type: "string", format: "email" } },
              },
            },
          },
        },
        responses: {
          200: { description: "Booking cancelled, seats released" },
          400: problem,
          404: problem,
          409: { ...problem, description: "Already cancelled" },
          422: { ...problem, description: "The event has started" },
        },
      },
    },
  },
  components: {
    schemas: {
      Problem: {
        type: "object",
        required: ["type", "title", "status", "code"],
        properties: {
          type: { type: "string" },
          title: { type: "string" },
          status: { type: "integer" },
          code: { type: "string" },
          detail: { type: "string" },
          errors: { type: "object", additionalProperties: { type: "string" } },
        },
      },
    },
  },
};
