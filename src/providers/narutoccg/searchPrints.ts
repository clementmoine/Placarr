/**
 * Print search for the Naruto CCG local catalogue.
 *
 * A card carries no barcode, so a shelf can never scan its way to one: the app
 * asks providers for candidates and the user picks a print. Everything is read
 * from `data/naruto/ccg/catalog.sqlite` — the pack is a closed corpus, so there
 * is no network call and no pagination to chase.
 */
import { assetsCardUrl } from "@/lib/packAssetUrls";
import type { PrintCandidate } from "@/types/providerModule";

import {
  ensureNarutoCcgIndex,
  NARUTO_PACK_ID,
  type NarutoPrintRow,
} from "./indexStore";

/**
 * Card families, as carddass.fr itself spelled them: the site filed faces under
 * `cartes/5/ninjas/`, `tactique/`, `technique/` and `clients/`. The stored
 * `card_type` is the two-letter prefix of the collector number.
 */
const CARD_FAMILY: Record<string, string> = {
  ni: "Ninja",
  ta: "Tactique",
  te: "Technique",
  cl: "Client",
  pr: "Promo",
};

/** `ni232` → `NI-232`, the way a collector reads it off the card. */
export function formatNarutoReference(setCode: string, number: string): string {
  const m = /^([a-z]+)(\d+)(-.*)?$/i.exec(number);
  const printed = m ? `${m[1]!.toUpperCase()}-${m[2]}${m[3] ?? ""}` : number;
  return `${setCode.toUpperCase()} · ${printed}`;
}

type SearchRow = {
  printKey: string;
  setCode: string;
  number: string;
  cardType: string | null;
  lang: string;
  fullName: string | null;
  rarity: string | null;
  art: string | null;
  thumb: string | null;
};

function toCandidate(row: SearchRow): PrintCandidate {
  const id = { set: row.setCode, lang: row.lang, card: row.number };
  return {
    printKey: row.printKey,
    // A print with no title yet still deserves to be pickable: the reference
    // alone identifies it, and hiding it would make the card unaddable.
    title:
      row.fullName?.trim() || formatNarutoReference(row.setCode, row.number),
    reference: formatNarutoReference(row.setCode, row.number),
    ...(row.rarity ? { rarity: row.rarity } : {}),
    ...(row.cardType
      ? { category: CARD_FAMILY[row.cardType.toLowerCase()] ?? row.cardType }
      : {}),
    ...(row.art
      ? { imageUrl: assetsCardUrl(NARUTO_PACK_ID, id, row.art) }
      : {}),
    ...(row.thumb
      ? { thumbnailUrl: assetsCardUrl(NARUTO_PACK_ID, id, row.thumb) }
      : {}),
    language: row.lang,
  };
}

/**
 * Rows matching a free-text query: card name, printed number (`NI-232`, `ni232`,
 * or bare `232`) or print key. One row per print — the preferred language wins,
 * so a card is never offered twice for the same printing.
 */
export function searchNarutoPrints(
  query: string,
  opts: { language?: string; limit?: number } = {},
): PrintCandidate[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const db = ensureNarutoCcgIndex();
  if (!db) return [];

  const lang = (opts.language || "fr").toLowerCase();
  const limit = Math.max(1, Math.min(opts.limit ?? 40, 200));
  // `NI-232` and `ni 232` must both reach `ni232` as stored.
  const compact = trimmed.toLowerCase().replace(/[\s-]/g, "");
  const like = `%${trimmed.toLowerCase()}%`;
  const likeCompact = `%${compact}%`;

  const rows = db
    .prepare(
      `SELECT p.print_key AS printKey,
              p.set_code   AS setCode,
              p.number     AS number,
              p.card_type  AS cardType,
              t.lang       AS lang,
              t.full_name  AS fullName,
              t.rarity     AS rarity,
              a.art        AS art,
              a.thumb      AS thumb
         FROM prints p
         LEFT JOIN print_titles t
                ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang
        WHERE LOWER(t.full_name) LIKE ?
           OR LOWER(p.number)    LIKE ?
           OR LOWER(p.print_key) LIKE ?
        ORDER BY (t.lang = ?) DESC, p.set_code, p.number
        LIMIT ?`,
    )
    .all(like, likeCompact, likeCompact, lang, limit * 3) as SearchRow[];

  const seen = new Set<string>();
  const out: PrintCandidate[] = [];
  for (const row of rows) {
    if (seen.has(row.printKey)) continue;
    seen.add(row.printKey);
    out.push(toCandidate(row));
    if (out.length >= limit) break;
  }
  return out;
}

/** One print by key — same shape, so the picker and the item agree. */
export function lookupNarutoPrint(
  printKey: string,
  opts: { language?: string } = {},
): PrintCandidate | null {
  const db = ensureNarutoCcgIndex();
  if (!db) return null;
  const lang = (opts.language || "fr").toLowerCase();
  const row = db
    .prepare(
      `SELECT p.print_key AS printKey,
              p.set_code   AS setCode,
              p.number     AS number,
              p.card_type  AS cardType,
              t.lang       AS lang,
              t.full_name  AS fullName,
              t.rarity     AS rarity,
              a.art        AS art,
              a.thumb      AS thumb
         FROM prints p
         LEFT JOIN print_titles t
                ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang
        WHERE p.print_key = ?
        ORDER BY (t.lang = ?) DESC
        LIMIT 1`,
    )
    .get(printKey, lang) as SearchRow | undefined;
  return row ? toCandidate(row) : null;
}

export type { NarutoPrintRow };
