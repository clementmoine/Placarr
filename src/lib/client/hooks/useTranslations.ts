"use client";

import { useCallback, useEffect, useState } from "react";
import { getMessages, locales, defaultLocale } from "@/lib/locale/i18n";
import { getBestLocale, setStoredLocale } from "@/lib/locale/utils";
import type { Locale, Messages } from "@/types/i18n";

export function useTranslations() {
  const [messages, setMessages] = useState<Messages | null>(null);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [isLoading, setIsLoading] = useState(true);

  // Get locale from localStorage or fallback to best available
  const currentLocale = getBestLocale();

  // Load messages when locale changes
  useEffect(() => {
    async function loadMessages() {
      setIsLoading(true);
      try {
        const msgs = await getMessages(currentLocale);
        setMessages(msgs);
        setLocale(currentLocale);

        // Store in localStorage for future visits
        setStoredLocale(currentLocale);
      } catch (error) {
        console.error("Failed to load messages:", error);
        // Fallback to default locale
        const fallbackMsgs = await getMessages(defaultLocale);
        setMessages(fallbackMsgs);
        setLocale(defaultLocale);
      } finally {
        setIsLoading(false);
      }
    }

    loadMessages();
  }, [currentLocale]);

  // Translation function
  const t = useCallback(
    (key: string, options?: Record<string, unknown>): string => {
      if (!messages) return key;

      const keys = key.split(".");
      let value: unknown = messages;

      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          return key; // Return key if translation not found
        }
      }

      if (typeof value === "string") {
        if (options) {
          // Replace the placeholders with the options
          return value.replace(/{(\w+)}/g, (match, p1) => {
            const val = options[p1 as keyof typeof options];
            if (val !== undefined) {
              return String(val);
            }
            return match;
          });
        }
        return value;
      }

      return key;
    },
    [messages],
  );

  // Change locale function
  const changeLocale = useCallback(
    (newLocale: Locale) => {
      if (newLocale === locale) return;

      // Store in localStorage immediately
      setStoredLocale(newLocale);

      // Just update the locale state, no URL change needed
      setLocale(newLocale);
    },
    [locale],
  );

  // Get available locales
  const availableLocales = locales;

  return {
    t,
    locale,
    changeLocale,
    availableLocales,
    isLoading,
    messages,
  };
}
