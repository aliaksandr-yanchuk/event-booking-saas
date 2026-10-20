import { etagFor, matchesIfNoneMatch } from "@/server/api/etag";
import { resolveEvent } from "@/server/api/resolve";
import { EventDetailResponse, jsonResponse } from "@/server/api/schemas";
import { toEventDetail } from "@/server/api/serializers";
import { getSeatMap } from "@/server/queries";

/**
 * GET /api/v1/organizations/{org}/events/{event} — event details with live seat availability.
 * The event page polls this endpoint to keep its seat map current.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/organizations/[org]/events/[event]">) {
  const { org, event: eventSlug } = await ctx.params;
  const resolved = await resolveEvent(org, eventSlug);
  if (!resolved.ok) {
    return resolved.response;
  }

  const seatMap = await getSeatMap(resolved.event.id);
  const body = { data: toEventDetail(resolved.event, seatMap) };
  const etag = etagFor(body);
  // Availability changes with every booking, so a stored copy must be revalidated on
  // every use (no-cache). Revalidating is cheap: unchanged data answers 304 without a body.
  const headers = { "Cache-Control": "no-cache", ETag: etag };

  if (matchesIfNoneMatch(request.headers.get("if-none-match"), etag)) {
    return new Response(null, { status: 304, headers });
  }
  return jsonResponse(EventDetailResponse, body, { headers });
}
