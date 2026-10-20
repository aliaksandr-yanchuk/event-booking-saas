import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { isLocale, type Locale } from "@/i18n/config";
import { dictionaryFor, type Dictionary } from "@/i18n/dictionaries";

export { dictionaryFor } from "@/i18n/dictionaries";

/**
 * The language of the page being rendered, read from the root [lang] segment, so Server
 * Components do not have to pass it down. (Server Actions and route handlers cannot use
 * root params; they receive the language as an argument instead.)
 */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!isLocale(value)) notFound();
  return value;
}

export async function getDictionary(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: dictionaryFor(locale) };
}
