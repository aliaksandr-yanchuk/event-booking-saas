import type { Locale } from "@/i18n/config";
import { en, type Dictionary } from "./en";
import { ja } from "./ja";

export type { Dictionary } from "./en";

const dictionaries: Record<Locale, Dictionary> = { en, ja };

/**
 * The dictionary for a language. Plain data, so it also works in the browser and in
 * modules without a request (emails, tests); pages use getDictionary() from "@/i18n".
 */
export function dictionaryFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}
