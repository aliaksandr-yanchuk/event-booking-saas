import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/server/auth/dal";

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <OrganizerList />
    </Suspense>
  );
}

async function OrganizerList() {
  const user = await requireUser("/dashboard");
  // Most people work for one organizer: take them straight there.
  if (user.memberships.length === 1) {
    redirect(`/dashboard/${user.memberships[0].organization.slug}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your organizers</h1>
      {user.memberships.length === 0 ? (
        <p className="text-muted">Your account is not a member of any organizer yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {user.memberships.map(({ organization }) => (
            <li key={organization.id}>
              <Link href={`/dashboard/${organization.slug}`} className="font-medium text-accent hover:underline">
                {organization.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
