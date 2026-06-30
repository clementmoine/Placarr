import { AsyncLocalStorage } from "node:async_hooks";

import type { Locale } from "@/types/i18n";

export type LocalePreferenceStore = {
  uiLocale: Locale;
};

export const localePreferenceStorage =
  new AsyncLocalStorage<LocalePreferenceStore>();

export function activeUiLocale(): Locale | undefined {
  return localePreferenceStorage.getStore()?.uiLocale;
}

export function runWithUiLocale<T>(uiLocale: Locale, fn: () => T): T {
  return localePreferenceStorage.run({ uiLocale }, fn);
}
