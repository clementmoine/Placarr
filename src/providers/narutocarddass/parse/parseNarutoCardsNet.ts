/**
 * narutocards.net sitemap — EN CCG titles derived from card URL slugs.
 *
 * Example: `/card/gaara-of-the-desert-n-us069/` → `nus0069` / "Gaara Of The Desert".
 * Names inherit slug typos (`spell-fomula`) — fill-only, never overwrite an attested title.
 */
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { parseEnCcgPrintedRef } from "./parseEnCcgPrinted";

export type NarutoCardsNetCard = {
  number: string;
  name: string;
  printedRef: string;
  slug: string;
  pageUrl: string;
};

const CARD_LOC_RE =
  /^https:\/\/narutocards\.net\/card\/(.+)-([njmc]|pr|ps)(-us\d+|-\d+[a-z]?)\/?$/i;

export function slugToNarutoCardsNetName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function printedRefFromNarutoCardsNetSuffix(
  cardType: string,
  suffix: string,
): string {
  const letter = cardType.toUpperCase();
  if (/^-us(\d+[a-z]?)$/i.test(suffix)) {
    return `${letter}-US${suffix.slice(3).replace(/[^\d]/g, "")}`;
  }
  return `${letter}-${suffix.slice(1).replace(/[^\d]/g, "")}`;
}

export function parseNarutoCardsNetCardUrl(
  loc: string,
): NarutoCardsNetCard | null {
  const m = CARD_LOC_RE.exec(loc.trim());
  if (!m) return null;
  const nameSlug = m[1]!.trim();
  const printedRef = printedRefFromNarutoCardsNetSuffix(m[2]!, m[3]!);
  const parsed = parseEnCcgPrintedRef(printedRef);
  if (!parsed?.number) return null;
  const name = slugToNarutoCardsNetName(nameSlug);
  if (!name) return null;
  const refTail = `${m[2]!.toLowerCase()}${m[3]!.toLowerCase()}`;
  const diskId = narutoDiskCardId(parsed.number) ?? parsed.number;
  return {
    number: diskId,
    name,
    printedRef,
    slug: `${nameSlug}-${refTail}`,
    pageUrl: loc.trim(),
  };
}

export function parseNarutoCardsNetSitemap(xml: string): NarutoCardsNetCard[] {
  const byNumber = new Map<string, NarutoCardsNetCard>();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
    const loc = match[1]?.trim();
    if (!loc?.includes("/card/")) continue;
    const row = parseNarutoCardsNetCardUrl(loc);
    if (!row || byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }
  return [...byNumber.values()].sort((a, b) =>
    a.number.localeCompare(b.number, "en"),
  );
}

export function mergeNarutoCardsNetIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly NarutoCardsNetCard[];
}): {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  addedPrints: string[];
  titled: string[];
} {
  const prints = [...input.prints];
  const titles = [...input.titles];
  const printByKey = new Map(
    prints.map((p) => [canonicalizeNarutoPrintKey(p.printKey), p]),
  );
  const titleKeys = new Set(
    titles.map(
      (t) =>
        `${canonicalizeNarutoPrintKey(t.printKey)}\0${t.lang.toLowerCase()}`,
    ),
  );
  const addedPrints: string[] = [];
  const titled: string[] = [];

  for (const row of input.cards) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const existing = printByKey.get(printKey);
    if (!existing) continue;
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) continue;
    titles.push({
      printKey,
      lang: "en",
      fullName: row.name.trim(),
      nameSource: "narutocards-net:slug",
    });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
