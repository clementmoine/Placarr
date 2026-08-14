/**
 * Print search for the Naruto CCG local catalogue.
 *
 * A card carries no barcode, so a shelf can never scan its way to one: the app
 * asks providers for candidates and the user picks a print. Everything is read
 * from `data/naruto/ccg/catalog.sqlite` — the pack is a closed corpus, so there
 * is no network call and no pagination to chase.
 */
import {
  NARUTO_CCG_EFFECT_PACK_ID,
  NARUTO_CCG_FINISHES,
  NARUTO_CCG_FULL_FOIL_MASK_URL,
} from "@/effects/narutoccg";
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

export type NarutoPrintDetail = {
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

/** Canonical vocabulary (`items.finishes.normal`), not an invented word. */
const PLAIN_FINISH = "normal";

/**
 * Every card is offered plain or holo, whatever the catalogue says its rarity
 * is.
 *
 * Deriving the finish from the rarity was tempting — the catalogue has no
 * finish axis — but the stored rarity is not trustworthy enough to *remove* an
 * option: `ta158` is filed `commune` and exists in holo in a real collection.
 * The parser also flattens the site's four grades (Commune, Rare, Holo, Holo
 * rare) into two, so a wrong guess would silently deny a collector the copy
 * they own. Rarity stays a displayed fact; it does not gate what you can hold.
 */
const NARUTO_FINISHES = [PLAIN_FINISH, ...NARUTO_CCG_FINISHES];

function toCandidate(row: NarutoPrintDetail): PrintCandidate {
  const id = { set: row.setCode, lang: row.lang, card: row.number };
  const finishes = NARUTO_FINISHES;
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
    finishes,
    // Derived from the same array, as Lorcana and TCGdex do, so the two can
    // never drift apart.
    plainFinishes: finishes.filter((finish) => finish === PLAIN_FINISH),
    // Read only once a shiny finish is resolved, so a plain copy stays flat.
    foilMaskUrl: NARUTO_CCG_FULL_FOIL_MASK_URL,
    /**
     * Carries the card back: the flip resolves the verso through the effect
     * pack registry, so without this the card had nothing to turn over.
     */
    effectPack: NARUTO_CCG_EFFECT_PACK_ID,
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
    .all(
      like,
      likeCompact,
      likeCompact,
      lang,
      limit * 3,
    ) as NarutoPrintDetail[];

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

/**
 * Raw catalogue row for one print — what both the picker candidate and the
 * item metadata are built from, so the two never disagree.
 */
export function lookupNarutoPrintDetail(
  printKey: string,
  opts: { language?: string } = {},
): NarutoPrintDetail | null {
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
    .get(printKey, lang) as NarutoPrintDetail | undefined;
  return row ?? null;
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
    .get(printKey, lang) as NarutoPrintDetail | undefined;
  return row ? toCandidate(row) : null;
}

export type { NarutoPrintRow };
