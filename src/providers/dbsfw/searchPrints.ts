/**
 * Print search for the Fusion World local catalogue.
 */
import {
  DBS_FW_EFFECT_PACK_ID,
  DBS_FW_FINISHES,
  DBS_FW_FULL_FOIL_MASK_URL,
} from "@/effects/dbsfw";
import type { PrintCandidate } from "@/types/providerModule";

import { ensureDbsFwIndex } from "./indexStore";
import { DBS_FW_GAME, formatDbsFwReference } from "./printIdentity";

const PLAIN_FINISH = "normal";
const DBS_FINISHES = [PLAIN_FINISH, ...DBS_FW_FINISHES];

export type DbsFwPrintDetail = {
  printKey: string;
  setCode: string;
  number: string;
  grouping: string | null;
  lang: string;
  fullName: string | null;
  setName: string | null;
  imageUrl: string | null;
};

function toCandidate(row: DbsFwPrintDetail): PrintCandidate {
  const finishes = DBS_FINISHES;
  const reference = formatDbsFwReference(row.setCode, row.number, row.grouping);
  return {
    printKey: row.printKey,
    title: row.fullName?.trim() || reference,
    reference,
    setCode: row.setCode,
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    ...(row.imageUrl ? { thumbnailUrl: row.imageUrl } : {}),
    language: row.lang,
    finishes,
    plainFinishes: finishes.filter((finish) => finish === PLAIN_FINISH),
    foilMaskUrl: DBS_FW_FULL_FOIL_MASK_URL,
    effectPack: DBS_FW_EFFECT_PACK_ID,
  };
}

const DETAIL_SQL = `SELECT p.print_key AS printKey,
              p.set_code   AS setCode,
              p.number     AS number,
              p.grouping   AS grouping,
              t.lang       AS lang,
              t.full_name  AS fullName,
              t.set_name   AS setName,
              a.image_url  AS imageUrl
         FROM prints p
         LEFT JOIN print_titles t
                ON t.print_key = p.print_key
         LEFT JOIN print_assets a
                ON a.print_key = p.print_key AND a.lang = t.lang`;

export function searchDbsFwPrints(
  query: string,
  opts: { language?: string; limit?: number } = {},
): PrintCandidate[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const db = ensureDbsFwIndex();
  if (!db) return [];

  const lang = (opts.language || "en").toLowerCase();
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
    ) as DbsFwPrintDetail[];

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

export function lookupDbsFwPrintDetail(
  printKey: string,
  opts: { language?: string } = {},
): DbsFwPrintDetail | null {
  const db = ensureDbsFwIndex();
  if (!db) return null;
  const lang = (opts.language || "en").toLowerCase();
  const row = db
    .prepare(
      `${DETAIL_SQL}
        WHERE p.print_key = ?
        ORDER BY (t.lang = ?) DESC
        LIMIT 1`,
    )
    .get(printKey, lang) as DbsFwPrintDetail | undefined;
  return row ?? null;
}

export function lookupDbsFwPrint(
  printKey: string,
  opts: { language?: string } = {},
): PrintCandidate | null {
  const row = lookupDbsFwPrintDetail(printKey, opts);
  if (!row) return null;
  if (!row.printKey.startsWith(`${DBS_FW_GAME}:`)) return null;
  return toCandidate(row);
}
