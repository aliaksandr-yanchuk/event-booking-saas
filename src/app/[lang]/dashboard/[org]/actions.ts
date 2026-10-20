"use server";

import { refresh } from "next/cache";
import { localizePath, type Locale } from "@/i18n/config";
import { requireMembership } from "@/server/auth/dal";
import { db } from "@/server/db";
import { checkInBooking } from "@/server/repositories/dashboard";

/**
 * Checks a guest in at the door. Owners and door staff may; the membership is checked
 * again here because a Server Action can be called without the page that shows it.
 */
export async function checkInAction(orgSlug: string, reference: string, locale: Locale) {
  const membership = await requireMembership(
    orgSlug,
    localizePath(locale, `/dashboard/${orgSlug}/check-in?ref=${reference}`),
  );
  await checkInBooking(db, { organizationId: membership.organization.id, reference, userId: membership.user.id });
  // The page shows the result (checked in, by whom, or why not) when it renders again.
  refresh();
}
