import Link from "next/link";
import { logoutAction } from "@/app/login/actions";
import { buttonClasses } from "@/components/ui/button";
import type { Membership } from "@/server/auth/dal";

/** Organizer name, sections and the signed-in user, at the top of every dashboard page. */
export function DashboardHeader({ membership }: { membership: Membership }) {
  const { organization, user, role } = membership;
  const base = `/dashboard/${organization.slug}`;

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Dashboard</p>
          <p className="text-xl font-semibold tracking-tight">{organization.name}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">
            {user.name} · {role === "OWNER" ? "Owner" : "Door staff"}
          </span>
          <form action={logoutAction}>
            <button type="submit" className={buttonClasses("secondary")}>
              Sign out
            </button>
          </form>
        </div>
      </div>
      <nav aria-label="Dashboard" className="flex gap-4 text-sm font-medium">
        <Link href={base} className="text-accent hover:underline">
          Events
        </Link>
        <Link href={`${base}/check-in`} className="text-accent hover:underline">
          Check-in
        </Link>
        {user.memberships.length > 1 && (
          <Link href="/dashboard" className="text-accent hover:underline">
            Switch organizer
          </Link>
        )}
      </nav>
    </div>
  );
}
