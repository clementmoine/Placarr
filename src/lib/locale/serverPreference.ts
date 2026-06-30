import type { NextRequest } from "next/server";

import { defaultLocale } from "@/lib/locale/i18n";
import { runWithUiLocale } from "@/lib/locale/preferenceContext.server";
import {
  PREFERRED_LOCALE_COOKIE,
  parseUiLocale,
} from "@/lib/locale/utils";
import type { Locale } from "@/types/i18n";

export function uiLocaleFromRequest(req: NextRequest): Locale {
  const fromCookie = req.cookies.get(PREFERRED_LOCALE_COOKIE)?.value;
  if (fromCookie) return parseUiLocale(fromCookie);

  const acceptLanguage = req.headers.get("accept-language");
  if (acceptLanguage) {
    const primary = acceptLanguage.split(",")[0]?.trim().split("-")[0];
    return parseUiLocale(primary);
  }

  return defaultLocale;
}

export async function withRequestUiLocale<T>(
  req: NextRequest,
  fn: (uiLocale: Locale) => Promise<T>,
): Promise<T> {
  const uiLocale = uiLocaleFromRequest(req);
  return runWithUiLocale(uiLocale, () => fn(uiLocale));
}
