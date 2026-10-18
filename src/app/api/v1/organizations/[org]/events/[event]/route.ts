import { resolveEvent } from "@/server/api/resolve";
import { EventDetailResponse, jsonResponse } from "@/server/api/schemas";
import { toEventDetail } from "@/server/api/serializers";
import { getSeatMap } from "@/server/queries";

/** GET /api/v1/organizations/{org}/events/{event} — event details with live seat availability. */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/organizations/[org]/events/[event]">) {
  const { org, event: eventSlug } = await ctx.params;
  const resolved = await resolveEvent(org, eventSlug);
  if (!resolved.ok) {
    return resolved.response;
  }

  const seatMap = await getSeatMap(resolved.event.id);
  return jsonResponse(
    EventDetailResponse,
    { data: toEventDetail(resolved.event, seatMap) },
    // Availability changes with every booking, so this response must not be cached.
    { headers: { "Cache-Control": "no-store" } },
  );
}
