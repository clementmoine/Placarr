/**
 * Primegame.it Italian singles — expansion rubrics + `/ajax/get_singles` rows.
 * Images come from tcg trend (`sthumb/{size}/{productId}`), not primegame CDN.
 */
import {
  mintNarutoPrintKey,
  narutoDiskCardId,
} from "../collectorIdentity";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";
import { cardTypeFromCollectorNumber } from "./parseBandaicgAsset";
import { colekaCarddassPrefixToCollector } from "./parseColekaS6It";

export type PrimegameItExpansion = {
  expansionId: number;
  slug: string;
  name: string;
  /** Known Carddass set when attested — s7/s8 exist on primegame only. */
  setCode: string | null;
};

export type PrimegameItCard = {
  number: string;
  name: string;
  setCode: string;
  printedRef: string;
  productId: number;
  productUrl: string;
  thumbUrl: string | null;
  expansionId: number;
};

const EXPANSION_LINK_RE =
  /href="\/Single\/Naruto\/(\d+)\/([^"]+)"/gi;

/** Primegame expansion ids observed 2026-09-02 — same rubrics as cardgame-club Wayback. */
export const PRIMEGAME_IT_EXPANSION_SET: Record<number, string | null> = {
  38: "s1",
  39: "s2",
  43: "s3",
  40: "s4",
  42: "s5",
  175: "s6",
  41: "promo",
  196: "s7",
  201: "s8",
};

const TITLE_RE =
  /^(NI|TE|TA|ST|CL)[-\s]?(\d{1,3})\s+(.+?)(?:\s+(?:comune|non comune|rara|ultra rara|epica|holo|foil).*)?$/i;

const PRODUCT_BLOCK_RE =
  /<div class="product-item[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;

const PRODUCT_LINK_RE =
  /href="(\/Product\/(\d+)\/[^"]+)"/i;

const PRODUCT_NAME_RE =
  /<div class="product-name"><a[^>]*>([^<]+)<\/a><\/div>/i;

const TCGTREND_THUMB_RE =
  /tcgtrend\.it\/(?:sthumb\/\d+\/(\d+)|thumbnailc\.aspx\?image=(\d+))/i;

export function primegameExpansionSetCode(expansionId: number): string | null {
  return PRIMEGAME_IT_EXPANSION_SET[expansionId] ?? null;
}

export function parsePrimegameExpansions(html: string): PrimegameItExpansion[] {
  const byId = new Map<number, PrimegameItExpansion>();
  for (const match of html.matchAll(EXPANSION_LINK_RE)) {
    const expansionId = Number(match[1]);
    if (!Number.isFinite(expansionId)) continue;
    const slug = match[2]!.replace(/_/g, " ").trim();
    const name = decodeURIComponent(match[2]!.replace(/_/g, " "));
    byId.set(expansionId, {
      expansionId,
      slug: match[2]!,
      name,
      setCode: primegameExpansionSetCode(expansionId),
    });
  }
  return [...byId.values()].sort((a, b) => a.expansionId - b.expansionId);
}

export function parsePrimegameSinglesResultCount(html: string): number {
  const m = html.match(/Showing\s+\d+-\d+\s+of\s+(\d+)/i);
  return m ? Number(m[1]) : 0;
}

export function parsePrimegameProductTitle(
  raw: string,
  setCode: string,
): Omit<PrimegameItCard, "productId" | "productUrl" | "thumbUrl" | "expansionId"> | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const m = TITLE_RE.exec(cleaned);
  if (!m) return null;
  const printedRef = `${m[1]!.toUpperCase()}-${m[2]}`;
  const number = colekaCarddassPrefixToCollector(printedRef);
  if (!number) return null;
  const name = m[3]!.replace(/\s+/g, " ").trim();
  if (!name) return null;
  return { number, name, setCode, printedRef };
}

export function parsePrimegameSinglesAjax(
  html: string,
  expansion: PrimegameItExpansion,
): PrimegameItCard[] {
  const setCode = expansion.setCode;
  if (!setCode || setCode === "s7" || setCode === "s8") return [];
  const out: PrimegameItCard[] = [];
  for (const block of html.match(PRODUCT_BLOCK_RE) ?? []) {
    const link = PRODUCT_LINK_RE.exec(block);
    const nameMatch = PRODUCT_NAME_RE.exec(block);
    if (!link || !nameMatch) continue;
    const productId = Number(link[2]);
    if (!Number.isFinite(productId)) continue;
    const parsed = parsePrimegameProductTitle(nameMatch[1]!, setCode);
    if (!parsed) continue;
    const thumb = TCGTREND_THUMB_RE.exec(block);
    const thumbId = thumb?.[1] ?? thumb?.[2];
    out.push({
      ...parsed,
      productId,
      productUrl: link[1]!,
      thumbUrl: thumbId
        ? `https://www.tcgtrend.it/sthumb/1000/${thumbId}`
        : null,
      expansionId: expansion.expansionId,
    });
  }
  return out;
}

export function tcgTrendFaceUrl(productId: number, size = 1000): string {
  return `https://www.tcgtrend.it/sthumb/${size}/${productId}`;
}

export function mergePrimegameItIntoIndex(input: {
  prints: NarutoPrintRow[];
  titles: NarutoTitleRow[];
  cards: readonly PrimegameItCard[];
}): { prints: NarutoPrintRow[]; titles: NarutoTitleRow[]; merged: number } {
  const printByKey = new Map(input.prints.map((row) => [row.printKey, row]));
  const titleByKey = new Map(
    input.titles.map((row) => [`${row.printKey}:${row.lang}`, row]),
  );
  let merged = 0;
  for (const card of input.cards) {
    const printKey = mintNarutoPrintKey(card.number);
    if (!printByKey.has(printKey)) {
      printByKey.set(printKey, {
        printKey,
        card: card.number,
        set: cardTypeFromCollectorNumber(card.number),
        rarity: null,
      });
    }
    const titleKey = `${printKey}:it`;
    const existing = titleByKey.get(titleKey);
    if (existing?.fullName && existing.fullName !== card.name) continue;
    titleByKey.set(titleKey, {
      printKey,
      lang: "it",
      fullName: card.name,
      setCode: card.setCode,
    });
    merged += 1;
  }
  return {
    prints: [...printByKey.values()],
    titles: [...titleByKey.values()],
    merged,
  };
}

export function primegameDiskCardId(printedRef: string): string | null {
  return narutoDiskCardId(printedRef);
}
