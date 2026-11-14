"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getMessages,
  locales,
  defaultLocale,
  resolveMessage,
} from "@/core/locale/i18n";
import { getBestLocale, setStoredLocale } from "@/core/locale/utils";
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

      const value = resolveMessage(messages, key);
      if (typeof value !== "string") return key;

      if (options) {
        return value.replace(/{(\w+)}/g, (match, placeholder) => {
          const val = options[placeholder as keyof typeof options];
          if (val !== undefined) return String(val);
          return match;
        });
      }
      return value;
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
