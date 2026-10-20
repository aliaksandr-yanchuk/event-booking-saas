import type { z } from "zod";
import { jsonResponse, Problem, type PROBLEM_CODES } from "@/server/api/schemas";

/**
 * Error responses in the RFC 9457 "Problem Details" format, so every API error
 * has the same shape: a machine-readable `code`, a human-readable `detail`,
 * and optional extra members such as field errors.
 * https://www.rfc-editor.org/rfc/rfc9457
 */
export type ProblemCode = (typeof PROBLEM_CODES)[number];

type ProblemExtras = Pick<z.output<typeof Problem>, "errors" | "takenSeatIds" | "limit">;

const TITLES: Record<ProblemCode, string> = {
  VALIDATION_FAILED: "The request body is invalid",
  INVALID_JSON: "The request body is not valid JSON",
  UNSUPPORTED_MEDIA_TYPE: "Send the request body as application/json",
  NOT_FOUND: "Resource not found",
  SEATS_TAKEN: "Some seats are already booked",
  TOO_MANY_SEATS: "Too many seats in one booking",
  INVALID_SEATS: "Some seats do not belong to this event",
  EVENT_NOT_BOOKABLE: "This event cannot be booked",
  ALREADY_CANCELLED: "The booking is already cancelled",
  EVENT_STARTED: "The event has already started",
  IDEMPOTENCY_KEY_REUSED: "This idempotency key was used for a different request",
  RATE_LIMITED: "Too many requests",
};

export function problem(
  status: number,
  code: ProblemCode,
  detail?: string,
  extras: ProblemExtras = {},
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(
    Problem,
    { type: `about:blank#${code}`, title: TITLES[code], status, code, ...(detail && { detail }), ...extras },
    { status, headers: { ...headers, "Content-Type": "application/problem+json" } },
  );
}

/** 429 with Retry-After, so well-behaved clients know when to try again. */
export function rateLimited(retryAfterSeconds: number): Response {
  return problem(
    429,
    "RATE_LIMITED",
    `Too many attempts from this client. Try again in ${retryAfterSeconds} seconds.`,
    {},
    { "Retry-After": String(retryAfterSeconds) },
  );
}

/** Reads a JSON body, rejecting other content types and malformed JSON with a problem response. */
export async function readJson(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: problem(415, "UNSUPPORTED_MEDIA_TYPE") };
  }
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: problem(400, "INVALID_JSON") };
  }
}
