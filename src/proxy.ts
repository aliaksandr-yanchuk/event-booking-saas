import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, localizePath, splitLocale } from "@/i18n/config";
import { SESSION_COOKIE } from "@/server/auth/session";

/**
 * Runs before every page request:
 *
 * 1. Language: Japanese URLs start with /ja; English URLs have no prefix and are
 *    rewritten to /en internally, because every page lives under app/[lang]. The browser
 *    keeps seeing the unprefixed URL.
 * 2. Dashboard, optimistic check only: no session cookie, straight to the login page
 *    (with the way back). No database here, because this runs before every request,
 *    prefetches included; the data access layer (src/server/auth/dal.ts) decides.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { locale, path } = splitLocale(pathname);

  // The CSV export answers 401 itself, which suits a download better than a redirect.
  const isDashboardPage = (path === "/dashboard" || path.startsWith("/dashboard/")) && !path.endsWith(".csv");
  if (isDashboardPage && !request.cookies.has(SESSION_COOKIE.name)) {
    const login = new URL(localizePath(locale, "/login"), request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if (locale === DEFAULT_LOCALE && !pathname.startsWith(`/${DEFAULT_LOCALE}/`) && pathname !== `/${DEFAULT_LOCALE}`) {
    const url = request.nextUrl.clone();
    url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything but the API, Next.js internals and files served as they are.
  matcher: ["/((?!api/|_next/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:png|jpg|svg|ico|webp|txt|xml)$).*)"],
};
