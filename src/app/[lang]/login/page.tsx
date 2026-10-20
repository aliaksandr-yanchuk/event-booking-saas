import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDictionary } from "@/i18n";
import { fill, localizePath } from "@/i18n/config";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { safeNextPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/server/auth/dal";
import { loginAction } from "./actions";
import { DemoAccountButton, LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.login.metaTitle, robots: { index: false, follow: false } };
}

type Props = PageProps<"/[lang]/login">;

export default async function LoginPage({ searchParams }: Props) {
  const { t } = await getDictionary();
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t.login.title}</h1>
        <p className="text-muted">{t.login.intro}</p>
      </header>
      <Suspense fallback={null}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SignIn({ searchParams }: Pick<Props, "searchParams">) {
  const { locale, t } = await getDictionary();
  const next = safeNextPath((await searchParams).next, localizePath(locale, "/dashboard"));
  if (await getCurrentUser()) {
    redirect(next);
  }
  // The password is shown as code inside the sentence, in either language.
  const [beforePassword, afterPassword] = t.login.demoText.split("{password}");

  return (
    <>
      <LoginForm
        action={loginAction.bind(null, locale)}
        next={next}
        t={{ email: t.login.email, password: t.login.password, signIn: t.login.signIn, signingIn: t.login.signingIn }}
      />
      <section
        aria-labelledby="demo-heading"
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
      >
        <h2 id="demo-heading" className="font-medium">
          {t.login.demoAccounts}
        </h2>
        <p className="text-sm text-muted">
          {beforePassword}
          <code className="font-mono text-foreground">{DEMO_PASSWORD}</code>
          {afterPassword}
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex items-center justify-between gap-3">
              <span>
                <span className="font-medium">{t.dashboard.roles[account.role]}</span> ·{" "}
                {account.organizationSlug === "harbor-hall" ? "Harbor Hall Live" : "Kyoto Chamber Orchestra"}
                <span className="block text-muted">{account.email}</span>
              </span>
              <DemoAccountButton
                email={account.email}
                password={DEMO_PASSWORD}
                label={t.login.signIn}
                ariaLabel={fill(t.login.signInAs, { email: account.email })}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
