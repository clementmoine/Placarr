/**
 * Print search for the DBS Masters local catalogue.
 *
 * Catalogue faces are local Deckplanet WebPs when synced; Bandai SAMPLE URLs
 * remain as fallback. The sleeve back lives on the effect pack; Leader
 * awakened faces are `cardBackUrl` on the print.
 */
import {
  DBS_CG_EFFECT_PACK_ID,
  DBS_CG_FINISHES,
  DBS_CG_FULL_FOIL_MASK_URL,
} from "@/effects/dbscg";
import type { PrintCandidate } from "@/types/providerModule";

import { ensureDbsCgIndex } from "./indexStore";
import { DBS_CG_GAME, formatDbsReference } from "./printIdentity";

const PLAIN_FINISH = "normal";
const DBS_FINISHES = [PLAIN_FINISH, ...DBS_CG_FINISHES];

export type DbsPrintDetail = {
  printKey: string;
  setCode: string;
  number: string;
  grouping: string | null;
  cardType: string | null;
  lang: string;
  fullName: string | null;
  rarity: string | null;
  setName: string | null;
  color: string | null;
  character: string | null;
  power: string | null;
  awakenedName: string | null;
  imageUrl: string | null;
  backUrl: string | null;
};

function toCandidate(row: DbsPrintDetail): PrintCandidate {
  const finishes = DBS_FINISHES;
  const reference = formatDbsReference(row.setCode, row.number, row.grouping);
  return {
    printKey: row.printKey,
    title: row.fullName?.trim() || reference,
    reference,
    setCode: row.setCode,
    ...(row.rarity ? { rarity: row.rarity } : {}),
    ...(row.cardType ? { category: row.cardType } : {}),
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    ...(row.imageUrl ? { thumbnailUrl: row.imageUrl } : {}),
    ...(row.backUrl ? { cardBackUrl: row.backUrl } : {}),
    language: row.lang,
    finishes,
    plainFinishes: finishes.filter((finish) => finish === PLAIN_FINISH),
    foilMaskUrl: DBS_CG_FULL_FOIL_MASK_URL,
    effectPack: DBS_CG_EFFECT_PACK_ID,
  };
}

const DETAIL_SQL = `SELECT p.print_key AS printKey,
              p.set_code   AS setCode,
              p.number     AS number,
              p.grouping   AS grouping,
              p.card_type  AS cardType,
              t.lang       AS lang,
              t.full_name  AS fullName,
              t.rarity     AS rarity,
              t.set_name   AS setName,
              t.color      AS color,
              t.character  AS character,
              t.power      AS power,
              t.awakened_name AS awakenedName,
              a.image_url  AS imageUrl,
              a.back_url   AS backUrl
         FROM prints p
         LEFT JOIN print_titles t
                ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang`;

export function searchDbsCgPrints(
  query: string,
  opts: { language?: string; limit?: number } = {},
): PrintCandidate[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const db = ensureDbsCgIndex();
  if (!db) return [];

  const lang = (opts.language || "fr").toLowerCase();
  const limit = Math.max(1, Math.min(opts.limit ?? 40, 200));
  const compact = trimmed.toLowerCase().replace(/[\s-]/g, "");
  const like = `%${trimmed.toLowerCase()}%`;
  const likeCompact = `%${compact}%`;

  const rows = db
    .prepare(
      `${DETAIL_SQL}
        WHERE LOWER(t.full_name) LIKE ?
           OR LOWER(p.number)    LIKE ?
           OR LOWER(p.print_key) LIKE ?
           OR LOWER(p.set_code || '-' || p.number) LIKE ?
           OR (p.grouping IS NOT NULL AND LOWER(p.set_code || '-' || p.number || '_' || p.grouping) LIKE ?)
        ORDER BY (t.lang = ?) DESC, p.set_code, p.number, p.grouping
        LIMIT ?`,
    )
    .all(
      like,
      likeCompact,
      likeCompact,
      like,
      like,
      lang,
      limit * 3,
    ) as DbsPrintDetail[];

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

export function lookupDbsCgPrintDetail(
  printKey: string,
  opts: { language?: string } = {},
): DbsPrintDetail | null {
  const db = ensureDbsCgIndex();
  if (!db) return null;
  const lang = (opts.language || "fr").toLowerCase();
  const row = db
    .prepare(
      `${DETAIL_SQL}
        WHERE p.print_key = ?
        ORDER BY (t.lang = ?) DESC
        LIMIT 1`,
    )
    .get(printKey, lang) as DbsPrintDetail | undefined;
  return row ?? null;
}

export function lookupDbsCgPrint(
  printKey: string,
  opts: { language?: string } = {},
): PrintCandidate | null {
  const row = lookupDbsCgPrintDetail(printKey, opts);
  if (!row) return null;
  if (!row.printKey.startsWith(`${DBS_CG_GAME}:`)) return null;
  return toCandidate(row);
}
