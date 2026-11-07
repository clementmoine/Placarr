import type { Locale } from "@/types/i18n";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

// Supported locales
export const locales: Locale[] = ["en", "fr"];
export const defaultLocale: Locale = "en";

const MESSAGES: Record<Locale, typeof en> = { en, fr };

// Locale detection from URL path
export function getLocaleFromPath(pathname: string): Locale {
  const segments = pathname.split("/");
  const locale = segments[1] as Locale;
  return locales.includes(locale) ? locale : defaultLocale;
}

// Get pathname with locale
export function getPathnameWithLocale(
  pathname: string,
  locale: Locale,
): string {
  const segments = pathname.split("/");
  if (locales.includes(segments[1] as Locale)) {
    segments[1] = locale;
  } else {
    segments.splice(1, 0, locale);
  }
  return segments.join("/");
}

// Get pathname without locale
export function getPathnameWithoutLocale(pathname: string): string {
  const segments = pathname.split("/");
  if (locales.includes(segments[1] as Locale)) {
    segments.splice(1, 1);
  }
  return segments.join("/") || "/";
}

/**
 * Sync catalogue — avoid `import(\`@/messages/${locale}.json\`)`.
 * That webpack lazy context can hang in the browser (keys stuck as
 * `auth.loginTitle` / `common.loading` forever).
 *
 * Webpack/JSON interop may wrap the object in `{ default: … }`.
 */
export async function getMessages(locale: Locale) {
  const mod = MESSAGES[locale] ?? MESSAGES[defaultLocale];
  const nested = (mod as { default?: typeof en }).default;
  return nested ?? mod;
}

// Type-safe message key access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNestedValue(obj: any, path: string): string {
  return path.split(".").reduce((current, key) => current?.[key], obj) || path;
}
