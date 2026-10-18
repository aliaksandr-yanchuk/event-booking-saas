/**
 * Error responses in the RFC 9457 "Problem Details" format, so every API error
 * has the same shape: a machine-readable `code`, a human-readable `detail`,
 * and optional extra members such as field errors.
 * https://www.rfc-editor.org/rfc/rfc9457
 */
export type ProblemCode =
  | "VALIDATION_FAILED"
  | "INVALID_JSON"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "NOT_FOUND"
  | "SEATS_TAKEN"
  | "TOO_MANY_SEATS"
  | "INVALID_SEATS"
  | "EVENT_NOT_BOOKABLE"
  | "ALREADY_CANCELLED"
  | "EVENT_STARTED";

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
};

export function problem(
  status: number,
  code: ProblemCode,
  detail?: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json(
    { type: `about:blank#${code}`, title: TITLES[code], status, code, ...(detail && { detail }), ...extra },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

/** Reads a JSON body, rejecting other content types and malformed JSON with a problem response. */
export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
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
