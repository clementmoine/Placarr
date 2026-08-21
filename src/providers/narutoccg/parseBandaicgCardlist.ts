/**
 * Official Bandai USA CCG cardlists (bandaicg.com Wayback).
 * Source of truth: `curated/sources/bandaicg-en-cardlist.json`.
 * Titles only — no faces. N/J/M/C, never NI. Skip N-US tin exclusives.
 */
import ledger from "./curated/sources/bandaicg-en-cardlist.json";
import {
  canonicalizeNarutoPrintKey,
  mintNarutoPrintKey,
  narutoDiskCardId,
  parseNarutoCollector,
} from "./collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";
import { parseEnCcgPrintedRef } from "./parseEnCcgPrinted";

export type BandaicgEnCardlistRow = (typeof ledger.cards)[number];

const ROW_RE =
  /card_col1"[^>]*>\s*([A-Z]{1,3}-?(?:US-?)?\d+)\s*<\/div>\s*<div class="card_link">(?:<a\b[^>]*>)?([^<]+)/gi;

export function bandaicgEnCardlistLedger() {
  return ledger;
}

export function bandaicgEnCardlistCards(): BandaicgEnCardlistRow[] {
  return ledger.cards;
}

export function parseBandaicgCardlistHtml(
  html: string,
  setCode: string,
): Array<{
  number: string;
  cardType: string;
  name: string;
  setCode: string;
  printed: string;
  rarity: string | null;
}> {
  const out: Array<{
    number: string;
    cardType: string;
    name: string;
    setCode: string;
    printed: string;
    rarity: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(ROW_RE)) {
    const printed = match[1]!.replace(/\s+/g, "").toUpperCase();
    const parsed = parseEnCcgPrintedRef(printed);
    if (!parsed?.number || parsed.usExclusive) continue;
    if (seen.has(parsed.number)) continue;
    const name = match[2]!.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const rarityMatch = html
      .slice(match.index ?? 0, (match.index ?? 0) + match[0].length + 180)
      .match(/card_col3"[^>]*>\s*([^<]+)\s*</i);
    seen.add(parsed.number);
    out.push({
      number: parsed.number,
      cardType: parsed.cardType,
      name,
      setCode,
      printed,
      rarity: rarityMatch?.[1]?.trim() || null,
    });
  }
  return out;
}

export function mergeBandaicgEnNamesIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
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

  for (const row of bandaicgEnCardlistCards()) {
    const printKey = mintNarutoPrintKey(row.number);
    if (!printKey) continue;
    const diskId = narutoDiskCardId(row.number) ?? row.number;
    const parsed = parseNarutoCollector(row.number);
    if (!printByKey.has(printKey)) {
      const print: NarutoPrintRow = {
        printKey,
        setCode: row.setCode,
        number: diskId,
        cardType: cardTypeFromCollectorNumber(diskId),
        family: parsed?.family ?? null,
      };
      prints.push(print);
      printByKey.set(printKey, print);
      addedPrints.push(printKey);
    }
    const titleKey = `${printKey}\0en`;
    if (titleKeys.has(titleKey)) continue;
    const name = row.name.trim();
    if (!name) continue;
    titles.push({
      printKey,
      lang: "en",
      fullName: name,
      rarity: row.rarity ?? null,
    });
    titleKeys.add(titleKey);
    titled.push(printKey);
  }

  prints.sort((a, b) => a.printKey.localeCompare(b.printKey));
  addedPrints.sort((a, b) => a.localeCompare(b));
  titled.sort((a, b) => a.localeCompare(b));
  return { prints, titles, addedPrints, titled };
}
