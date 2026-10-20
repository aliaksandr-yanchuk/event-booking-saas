import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

/**
 * Optimistic check only: no session cookie, no dashboard page, straight to the login
 * page (with the way back). It reads no database, because the proxy runs before every
 * matching request, including prefetches. Whether the cookie is valid, and what the
 * user may see, is decided by the data access layer (src/server/auth/dal.ts).
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE.name)) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Not the CSV export: it answers 401 itself, which suits a download better than a redirect.
  matcher: ["/dashboard", "/dashboard/((?!.*\\.csv$).*)"],
};
