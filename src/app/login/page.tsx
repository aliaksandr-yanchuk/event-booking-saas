import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { safeNextPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/server/auth/dal";
import { loginAction } from "./actions";
import { DemoAccountButton, LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Organizer sign-in",
  robots: { index: false, follow: false },
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Organizer sign-in</h1>
        <p className="text-muted">See sales and bookings for your events, and check guests in at the door.</p>
      </header>
      <Suspense fallback={null}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SignIn({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const next = safeNextPath((await searchParams).next);
  if (await getCurrentUser()) {
    redirect(next);
  }

  return (
    <>
      <LoginForm action={loginAction} next={next} />
      <section
        aria-labelledby="demo-heading"
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="demo-heading" className="font-medium">
          Demo accounts
        </h2>
        <p className="text-sm text-muted">
          Password <code className="font-mono text-foreground">{DEMO_PASSWORD}</code> for all of them. They see the
          bookings visitors make on this demo, so book with made-up details.
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex items-center justify-between gap-3">
              <span>
                <span className="font-medium">{account.role === "OWNER" ? "Owner" : "Door staff"}</span> ·{" "}
                {account.organizationSlug === "harbor-hall" ? "Harbor Hall Live" : "Kyoto Chamber Orchestra"}
                <span className="block text-muted">{account.email}</span>
              </span>
              <DemoAccountButton email={account.email} password={DEMO_PASSWORD} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
