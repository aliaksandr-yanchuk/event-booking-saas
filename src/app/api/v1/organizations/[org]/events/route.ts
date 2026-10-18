import { problem } from "@/server/api/problem";
import { EventListResponse, jsonResponse } from "@/server/api/schemas";
import { toEventSummary } from "@/server/api/serializers";
import { getOrganization, getUpcomingEvents } from "@/server/queries";

/** GET /api/v1/organizations/{org}/events — upcoming published events of one organizer. */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/organizations/[org]/events">) {
  const { org } = await ctx.params;
  const organization = await getOrganization(org);
  if (!organization) {
    return problem(404, "NOT_FOUND", `No organizer "${org}".`);
  }

  const events = await getUpcomingEvents(organization.id);
  return jsonResponse(
    EventListResponse,
    {
      organizer: { slug: organization.slug, name: organization.name },
      data: events.map((event) => toEventSummary(event, organization.slug)),
    },
    // Event listings change rarely; shared caches may keep them for a minute.
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
