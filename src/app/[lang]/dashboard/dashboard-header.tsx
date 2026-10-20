import Link from "next/link";
import { logoutAction } from "@/app/[lang]/login/actions";
import { buttonClasses } from "@/components/ui/button";
import { localizePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Membership } from "@/server/auth/dal";

/** Organizer name, sections and the signed-in user, at the top of every dashboard page. */
export function DashboardHeader({
  membership,
  locale,
  t,
}: {
  membership: Membership;
  locale: Locale;
  t: Dictionary["dashboard"];
}) {
  const { organization, user, role } = membership;
  const base = localizePath(locale, `/dashboard/${organization.slug}`);

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{t.label}</p>
          <p className="text-xl font-semibold tracking-tight">{organization.name}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">
            {user.name} · {t.roles[role]}
          </span>
          <form action={logoutAction.bind(null, locale)}>
            <button type="submit" className={buttonClasses("secondary")}>
              {t.signOut}
            </button>
          </form>
        </div>
      </div>
      <nav aria-label={t.nav} className="flex gap-4 text-sm font-medium">
        <Link href={base} className="text-accent hover:underline">
          {t.events}
        </Link>
        <Link href={`${base}/check-in`} className="text-accent hover:underline">
          {t.checkIn}
        </Link>
        {user.memberships.length > 1 && (
          <Link href={localizePath(locale, "/dashboard")} className="text-accent hover:underline">
            {t.switchOrganizer}
          </Link>
        )}
      </nav>
    </div>
  );
}
