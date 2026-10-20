"use client";

import { useActionState } from "react";
import type { LoginFormState } from "@/app/login/actions";
import { buttonClasses } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { submitWithoutReset } from "@/lib/submit-without-reset";

type LoginFormProps = {
  action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
  next: string;
};

export function LoginForm({ action, next }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  return (
    <form
      action={formAction}
      onSubmit={submitWithoutReset(formAction)}
      className="flex flex-col gap-4"
      noValidate
      data-login-form
    >
      <input type="hidden" name="next" value={next} />
      <TextField label="Email" name="email" type="email" autoComplete="username" defaultValue={state.email} required />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      {state.message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      <button type="submit" className={buttonClasses("primary")} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

/** Fills the sign-in form with a demo account (the credentials are also shown as text). */
export function DemoAccountButton({ email, password }: { email: string; password: string }) {
  function fill(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.ownerDocument.querySelector<HTMLFormElement>("form[data-login-form]");
    if (!form) return;
    (form.elements.namedItem("email") as HTMLInputElement).value = email;
    (form.elements.namedItem("password") as HTMLInputElement).value = password;
    form.requestSubmit();
  }

  return (
    <button
      type="button"
      onClick={fill}
      className={buttonClasses("secondary", "shrink-0")}
      aria-label={`Sign in as ${email}`}
    >
      Sign in
    </button>
  );
}
