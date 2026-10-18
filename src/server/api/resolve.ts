import { getOrganization, getPublicEvent } from "@/server/queries";
import { problem } from "@/server/api/problem";

/** Looks up the organizer and its event from the URL, or returns a 404 problem response. */
export async function resolveEvent(orgSlug: string, eventSlug: string) {
  const organization = await getOrganization(orgSlug);
  if (!organization) {
    return { ok: false as const, response: problem(404, "NOT_FOUND", `No organizer "${orgSlug}".`) };
  }
  const event = await getPublicEvent(organization.id, eventSlug);
  if (!event) {
    return { ok: false as const, response: problem(404, "NOT_FOUND", `No event "${eventSlug}" for this organizer.`) };
  }
  return { ok: true as const, organization, event };
}
