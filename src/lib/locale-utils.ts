import type { Locale } from "@/types/i18n";
import { locales, defaultLocale } from "@/lib/i18n";

// Get locale from localStorage
export function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem("preferred-locale");
    if (stored && locales.includes(stored as Locale)) {
      return stored as Locale;
    }
  } catch (error) {
    console.warn("Failed to read locale from localStorage:", error);
  }

  return null;
}

// Set locale in localStorage
export function setStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem("preferred-locale", locale);
  } catch (error) {
    console.warn("Failed to save locale to localStorage:", error);
  }
}

// Get browser locale
export function getBrowserLocale(): Locale | null {
  if (typeof window === "undefined") return null;

  try {
    const browserLocale = navigator.language.split("-")[0];
    if (locales.includes(browserLocale as Locale)) {
      return browserLocale as Locale;
    }
  } catch (error) {
    console.warn("Failed to detect browser locale:", error);
  }

  return null;
}

// Get the best locale to use (priority: localStorage > browser > default)
export function getBestLocale(): Locale {
  // First priority: localStorage
  const storedLocale = getStoredLocale();
  if (storedLocale) {
    return storedLocale;
  }

  // Second priority: browser locale
  const browserLocale = getBrowserLocale();
  if (browserLocale) {
    return browserLocale;
  }

  // Fallback: default locale
  return defaultLocale;
}
