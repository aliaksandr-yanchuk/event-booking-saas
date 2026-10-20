import { DEFAULT_LOCALE, INTL_LOCALE, type Locale } from "@/i18n/config";
/**
 * Prices are stored as integers in the currency's minor unit (cents for USD,
 * whole yen for JPY), so arithmetic never touches floating point.
 */
export function formatMoney(amountMinor: number, currency: string, locale: Locale = DEFAULT_LOCALE): string {
  const formatter = new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** fractionDigits);
}

/**
 * A price as shown to customers: the "Free" label (from the dictionary) instead of "¥0".
 * The label is passed in, so this module stays free of dictionaries and cheap for the browser.
 */
export function formatPrice(
  amountMinor: number,
  currency: string,
  { locale = DEFAULT_LOCALE, free }: { locale?: Locale; free: string },
): string {
  return amountMinor === 0 ? free : formatMoney(amountMinor, currency, locale);
}

export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
