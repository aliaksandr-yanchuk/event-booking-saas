import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { MemberRole } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { SESSION_COOKIE, findSessionUserId } from "@/server/auth/session";

/**
 * Data access layer for the organizer dashboard: the only place that turns the session
 * cookie into a user and a user into permissions. Every dashboard page, Server Action
 * and route handler calls it again (not just a layout or the proxy), because a layout
 * does not re-render on navigation and an action can be called directly.
 */

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  memberships: { role: MemberRole; organization: { id: string; slug: string; name: string } }[];
};

/** The signed-in user, or null. Cached per request, so several components can ask. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE.name)?.value;
  if (!token) {
    return null;
  }
  // Whether a session is still valid depends on the current time, so this (and everything
  // that waits for it) is rendered per request, never into a prefetched App Shell.
  await connection();
  const userId = await findSessionUserId(db, token);
  if (!userId) {
    return null;
  }
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      memberships: {
        select: { role: true, organization: { select: { id: true, slug: true, name: true } } },
        orderBy: { organization: { name: "asc" } },
      },
    },
  });
});

/** The signed-in user; anyone else is sent to the login page, and back here afterwards. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }
  return user;
}

export type Membership = {
  user: CurrentUser;
  organization: { id: string; slug: string; name: string };
  role: MemberRole;
  isOwner: boolean;
};

/**
 * The user's membership of this organizer. Not a member: 404, the same answer as for
 * an organizer that does not exist, so the dashboard does not confirm which ones do.
 * The returned organization ID is what every dashboard query is scoped to.
 */
export async function requireMembership(orgSlug: string, returnTo: string): Promise<Membership> {
  const user = await requireUser(returnTo);
  const membership = user.memberships.find((m) => m.organization.slug === orgSlug);
  if (!membership) {
    notFound();
  }
  return { user, organization: membership.organization, role: membership.role, isOwner: membership.role === "OWNER" };
}
