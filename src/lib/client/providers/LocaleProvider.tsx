"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useTranslations } from "@/lib/client/hooks/useTranslations";
import type { Locale } from "@/types/i18n";

interface LocaleContextType {
  t: (key: string, options?: Record<string, unknown>) => string;
  locale: Locale;
  changeLocale: (locale: Locale) => void;
  availableLocales: Locale[];
  isLoading: boolean;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function useLocale() {
  const context = useContext(LocaleContext);
  if (context === undefined) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}

interface LocaleProviderProps {
  children: ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const localeData = useTranslations();

  return (
    <LocaleContext.Provider value={localeData}>
      {children}
    </LocaleContext.Provider>
  );
}
