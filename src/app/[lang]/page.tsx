import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getDictionary } from "@/i18n";
import { localizePath, plural } from "@/i18n/config";
import { localizedAlternates } from "@/i18n/metadata";
import { getOrganizations } from "@/server/queries";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getDictionary();
  return { alternates: localizedAlternates(locale, "/") };
}

export default async function HomePage() {
  const { t } = await getDictionary();
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t.home.title}</h1>
        <p className="max-w-2xl text-lg text-muted">{t.home.intro}</p>
      </section>

      <section aria-labelledby="organizers-heading" className="flex flex-col gap-4">
        <h2 id="organizers-heading" className="text-xl font-semibold">
          {t.home.organizers}
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
  const [{ locale, t }, organizations] = await Promise.all([getDictionary(), getOrganizations()]);

  if (organizations.length === 0) {
    return <p className="text-muted">{t.home.noOrganizers}</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {organizations.map((organization) => (
        <li key={organization.id}>
          <Link
            href={localizePath(locale, `/${organization.slug}`)}
            className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent"
          >
            <span className="text-lg font-medium">{organization.name}</span>
            <span className="text-sm text-muted">{plural(t.home.publishedEvents, organization._count.events)}</span>
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
