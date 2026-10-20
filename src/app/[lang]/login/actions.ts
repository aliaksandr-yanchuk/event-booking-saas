"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dictionaryFor } from "@/i18n";
import { localizePath, type Locale } from "@/i18n/config";
import { safeNextPath } from "@/lib/safe-redirect";
import { hashForUnknownUser, verifyPassword } from "@/server/auth/password";
import { SESSION_COOKIE, createSession, deleteSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { limitLogin, recordFailedLogin, retryAfterMessage } from "@/server/rate-limit";

export type LoginFormState = { status: "idle" | "error"; message?: string; email?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export async function loginAction(
  locale: Locale,
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const t = dictionaryFor(locale);
  // One message for an unknown email and a wrong password: don't reveal which accounts exist.
  const WRONG_CREDENTIALS = t.login.wrongCredentials;
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") ?? "" });
  if (!parsed.success) {
    return { status: "error", message: WRONG_CREDENTIALS, email };
  }

  const limit = await limitLogin(await headers(), parsed.data.email);
  if (!limit.allowed) {
    return { status: "error", message: retryAfterMessage(limit.retryAfterSeconds, t.rateLimited), email };
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, passwordHash: true },
  });
  // Hash even for an unknown email, so both failures take the same time.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await hashForUnknownUser()));
  if (!user || !valid) {
    await recordFailedLogin(parsed.data.email);
    return { status: "error", message: WRONG_CREDENTIALS, email };
  }

  // A new token on every sign-in: a session ID planted before login is never reused.
  const session = await createSession(db, user.id);
  (await cookies()).set(SESSION_COOKIE.name, session.token, { ...SESSION_COOKIE.options, expires: session.expiresAt });
  redirect(safeNextPath(formData.get("next"), localizePath(locale, "/dashboard")));
}

export async function logoutAction(locale: Locale) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE.name)?.value;
  if (token) {
    await deleteSession(db, token);
  }
  jar.delete(SESSION_COOKIE.name);
  redirect(localizePath(locale, "/login"));
}
