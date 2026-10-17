import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getOrganizations } from "@/server/queries";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Reserved seating for live events
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Each organizer gets its own event pages and seat maps. Pick your seats on a live map, and
          the booking is confirmed at once. Two people can never get the same seat.
        </p>
      </section>

      <section aria-labelledby="organizers-heading" className="flex flex-col gap-4">
        <h2 id="organizers-heading" className="text-xl font-semibold">
          Organizers
        </h2>
        <Suspense fallback={<OrganizerListSkeleton />}>
          <OrganizerList />
        </Suspense>
      </section>
    </div>
  );
}

async function OrganizerList() {
  // Read at request time, so the build does not need a database.
  await connection();
  const organizations = await getOrganizations();

  if (organizations.length === 0) {
    return <p className="text-muted">No organizers yet. Run `npm run db:seed` to add demo data.</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {organizations.map((organization) => (
        <li key={organization.id}>
          <Link
            href={`/${organization.slug}`}
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent"
          >
            <span className="text-lg font-medium">{organization.name}</span>
            <span className="text-sm text-muted">
              {organization._count.events} published{" "}
              {organization._count.events === 1 ? "event" : "events"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OrganizerListSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-border/50" />
      ))}
    </div>
  );
}
