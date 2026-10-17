/**
 * Prices are stored as integers in the currency's minor unit (cents for USD,
 * whole yen for JPY), so arithmetic never touches floating point.
 */
export function formatMoney(amountMinor: number, currency: string, locale = "en-US"): string {
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** fractionDigits);
}

export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
