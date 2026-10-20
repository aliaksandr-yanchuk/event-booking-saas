import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDictionary } from "@/i18n";
import { localizePath } from "@/i18n/config";
import { requireUser } from "@/server/auth/dal";

export default async function DashboardPage() {
  const { t } = await getDictionary();
  return (
    <Suspense fallback={<p className="text-muted">{t.dashboard.loading}</p>}>
      <OrganizerList />
    </Suspense>
  );
}

async function OrganizerList() {
  const { locale, t } = await getDictionary();
  const user = await requireUser(localizePath(locale, "/dashboard"));
  // Most people work for one organizer: take them straight there.
  if (user.memberships.length === 1) {
    redirect(localizePath(locale, `/dashboard/${user.memberships[0].organization.slug}`));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t.dashboard.yourOrganizers}</h1>
      {user.memberships.length === 0 ? (
        <p className="text-muted">{t.dashboard.noMemberships}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {user.memberships.map(({ organization }) => (
            <li key={organization.id}>
              <Link
                href={localizePath(locale, `/dashboard/${organization.slug}`)}
                className="font-medium text-accent hover:underline"
              >
                {organization.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
