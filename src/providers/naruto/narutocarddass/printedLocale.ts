/**
 * Per-(set, lang, number) cardboard flag for Carddass catalogue tiles.
 *
 * Set-scoped asset fan-out must recompute this for the *target* printKey —
 * copying `printed: false` from a cancelled S6 FR row onto s2/s5 siblings
 * marked retail cardboard as « non éditée ».
 */

import {
  isNarutoFrUnpublishedHtmlNumber,
  isNarutoLangPrinted,
} from "./identity";
import { isNarutoFansetCollector } from "./parse/catalogues";
import { isNarutoS6FrPrintedNumber } from "./sources/titles";

export function resolveNarutoLocalePrinted(opts: {
  setCode: string | null | undefined;
  lang: string | null | undefined;
  number: string | null | undefined;
}): boolean {
  const lang = (opts.lang ?? "").trim().toLowerCase();
  const set = (opts.setCode ?? "").trim().toLowerCase();
  const number = (opts.number ?? "").trim();
  if (set === "fanset" || (number && isNarutoFansetCollector(number))) {
    return false;
  }
  if (
    (lang === "fr" || lang === "fra") &&
    number &&
    isNarutoFrUnpublishedHtmlNumber(number)
  ) {
    return false;
  }
  // Attested S6 FR inserts (Kana / DVD) — real cardboard despite set cancel.
  if (number && isNarutoS6FrPrintedNumber(number)) return true;
  if ((lang === "fr" || lang === "fra") && set === "s6") return false;
  return isNarutoLangPrinted(set || null, lang || "fr");
}
