// Cache tag names in one place, so the code that caches data and the code
// that invalidates it after a write cannot drift apart.
export const cacheTags = {
  organizations: () => "organizations",
  organizationEvents: (organizationId: string) => `org:${organizationId}:events`,
  event: (eventId: string) => `event:${eventId}`,
  eventAvailability: (eventId: string) => `event:${eventId}:availability`,
};
