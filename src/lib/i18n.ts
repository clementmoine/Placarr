import type { Locale } from '@/types/i18n';

// Supported locales
export const locales: Locale[] = ['en', 'fr'];
export const defaultLocale: Locale = 'en';

// Locale detection from URL path
export function getLocaleFromPath(pathname: string): Locale {
  const segments = pathname.split('/');
  const locale = segments[1] as Locale;
  return locales.includes(locale) ? locale : defaultLocale;
}

// Get pathname with locale
export function getPathnameWithLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split('/');
  if (locales.includes(segments[1] as Locale)) {
    segments[1] = locale;
  } else {
    segments.splice(1, 0, locale);
  }
  return segments.join('/');
}

// Get pathname without locale
export function getPathnameWithoutLocale(pathname: string): string {
  const segments = pathname.split('/');
  if (locales.includes(segments[1] as Locale)) {
    segments.splice(1, 1);
  }
  return segments.join('/') || '/';
}

// Load messages for a specific locale
export async function getMessages(locale: Locale) {
  try {
    const messages = await import(`@/messages/${locale}.json`);
    return messages.default;
  } catch (error) {
    console.warn(`Failed to load messages for locale: ${locale}`, error);
    // Fallback to default locale
    const fallbackMessages = await import(`@/messages/${defaultLocale}.json`);
    return fallbackMessages.default;
  }
}

// Type-safe message key access
export function getNestedValue(obj: any, path: string): string {
  return path.split('.').reduce((current, key) => current?.[key], obj) || path;
}
