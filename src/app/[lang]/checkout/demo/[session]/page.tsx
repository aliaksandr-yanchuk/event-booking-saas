import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { getDictionary } from "@/i18n";
import { fill, localizePath } from "@/i18n/config";
import { formatEventTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db";
import { getPaymentProvider } from "@/server/payments";
import { CHECKOUT_TTL_MS, HOLD_TTL_MS } from "@/server/payments/provider";
import { findBookingByCheckoutSession } from "@/server/repositories/bookings";
import { payDemoCheckoutAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: t.checkout.metaTitle, robots: { index: false, follow: false } };
}

type Props = PageProps<"/[lang]/checkout/demo/[session]">;

/**
 * Stand-in for Stripe Checkout when no Stripe keys are configured (local development,
 * CI and a demo without keys). It exists only while the demo provider is active.
 */
export default async function DemoCheckoutPage({ params }: Props) {
  const { t } = await getDictionary();
  return (
    <Suspense fallback={<p className="text-muted">{t.checkout.loading}</p>}>
      <DemoCheckout params={params} />
    </Suspense>
  );
}

async function DemoCheckout({ params }: Pick<Props, "params">) {
  await connection();
  const { session } = await params;
  if (getPaymentProvider().name !== "demo") {
    notFound();
  }
  const booking = await findBookingByCheckoutSession(db, session);
  if (!booking || booking.paymentProvider !== "demo") {
    notFound();
  }

  const { locale, t } = await getDictionary();
  const bookingPage = localizePath(locale, `/${booking.organization.slug}/bookings/${booking.reference}`);
  // Like Stripe, the checkout closes a few minutes before the hold runs out.
  const closesAt = booking.expiresAt && new Date(booking.expiresAt.getTime() - (HOLD_TTL_MS - CHECKOUT_TTL_MS));
  const open = booking.status === "PENDING" && closesAt !== null && closesAt > new Date();
  const total = formatMoney(booking.totalMinor, booking.event.currency, locale);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <p className="rounded-lg border border-border bg-accent-soft px-4 py-3 text-sm">
        <strong>{t.checkout.noticeTitle}</strong> {t.checkout.notice}
      </p>

      <section
        aria-labelledby="checkout-heading"
        className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6"
      >
        <h1 id="checkout-heading" className="text-2xl font-semibold tracking-tight">
          {booking.event.title}
        </h1>
        <ul className="text-sm">
          {booking.seatLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-border pt-3 font-medium">
          <span>{t.checkout.total}</span>
          <span>{total}</span>
        </p>

        {open ? (
          <>
            <p className="text-sm text-muted">
              {fill(t.checkout.openUntil, { time: formatEventTime(closesAt, locale) })}
            </p>
            <form action={payDemoCheckoutAction.bind(null, session, locale)}>
              <button type="submit" className={buttonClasses("primary", "w-full")}>
                {fill(t.checkout.pay, { amount: total })}
              </button>
            </form>
          </>
        ) : (
          <p role="alert" className="text-sm text-danger">
            {t.checkout.closed}
          </p>
        )}
      </section>

      <Link href={bookingPage} className="text-center text-sm text-accent hover:underline">
        {open ? t.checkout.cancel : t.checkout.goToBooking}
      </Link>
    </div>
  );
}
