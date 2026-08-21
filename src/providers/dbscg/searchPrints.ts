/**
 * Print search for the DBS Masters local catalogue.
 *
 * Catalogue faces are the local synced WebPs when present (400x560, see
 * `dbscardsFaces`); Bandai SAMPLE URLs remain as fallback at 260x363. The
 * sleeve back lives on the effect pack; Leader awakened faces are
 * `cardBackUrl` on the print.
 */
import {
  DBS_CG_EFFECT_PACK_ID,
  DBS_CG_FINISHES,
  DBS_CG_FULL_FOIL_MASK_URL,
} from "@/effects/dbscg";
import {
  isAnsweredQuery,
  setScopedWhere,
} from "@/providers/shared/cardCatalogue/sets";
import type { PrintCandidate } from "@/types/providerModule";

import { assetsCardUrl } from "@/lib/packAssetUrls";

import {
  DBS_CG_PACK_ID,
  dbsCgCardFolder,
  dbsCgLocalArtFilename,
  dbsCgLocalBackFilename,
  ensureDbsCgIndex,
} from "./indexStore";
import type { DbsCgFactsEntry } from "./buildMastersFacts";
import { dbsCgFactsFor } from "./factsStore";
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
  /**
   * Texte de la carte, traits, ère, coûts, verso, statut tournoi et errata,
   * bâtis depuis le dépôt Masters. Anglophones.
   */
  harvested?: DbsCgFactsEntry | null;
};

/**
 * The synced face, when the pack has one.
 *
 * Worth preferring over `image_url`: the local file is 400x560 from
 * dbscards.fr, where Bandai's own URL is 260x363 — and it was already being
 * downloaded, just never used, so every card was served at the smaller size.
 *
 * Read from the printing's own locale folder: the English pool (Deckplanet)
 * and the French one are different scans, and a print must show its own.
 */
function localFaceUrl(row: DbsPrintDetail): string | null {
  return localFileUrl(row, dbsCgLocalArtFilename);
}

/**
 * The Leader's awakened side from disk, when the pack holds it.
 *
 * Same oversight the front face had: the pass downloads these and the
 * candidate handed out Bandai's remote `_b.png` regardless, so every stored
 * back sat unused.
 */
function localBackUrl(row: DbsPrintDetail): string | null {
  return localFileUrl(row, dbsCgLocalBackFilename);
}

function localFileUrl(
  row: DbsPrintDetail,
  resolve: (print: DbsPrintDetail, lang: string) => string | null,
): string | null {
  const lang = (row.lang || "fr").toLowerCase();
  const file = resolve(row, lang);
  if (!file) return null;
  return assetsCardUrl(
    DBS_CG_PACK_ID,
    { set: row.setCode, lang, card: dbsCgCardFolder(row) },
    file,
  );
}

function toCandidate(row: DbsPrintDetail): PrintCandidate {
  const finishes = DBS_FINISHES;
  const reference = formatDbsReference(row.setCode, row.number, row.grouping);
  // Remote Bandai URL stays as the fallback for a print not synced yet.
  const face = localFaceUrl(row) ?? row.imageUrl;
  return {
    printKey: row.printKey,
    title: row.fullName?.trim() || reference,
    reference,
    setCode: row.setCode,
    ...(row.rarity ? { rarity: row.rarity } : {}),
    ...(row.cardType ? { category: row.cardType } : {}),
    ...(face ? { imageUrl: face } : {}),
    ...(face ? { thumbnailUrl: face } : {}),
    // Local first, remote as the fallback — as for the face.
    ...((localBackUrl(row) ?? row.backUrl)
      ? { cardBackUrl: localBackUrl(row) ?? row.backUrl }
      : {}),
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
  opts: { language?: string; limit?: number; setId?: string | null } = {},
): PrintCandidate[] {
  const trimmed = query.trim();
  const setId = opts.setId?.trim().toLowerCase();
  /*
    Une extension seule est une question complète — « montre-moi ce set » — et
    c'est ainsi qu'on le parcourt sans savoir quoi y chercher. Sans extension,
    une requête vide reste sans réponse.
  */
  if (!isAnsweredQuery(trimmed, setId)) return [];
  const db = ensureDbsCgIndex();
  if (!db) return [];

  const lang = (opts.language || "fr").toLowerCase();
  const limit = Math.max(1, Math.min(opts.limit ?? 40, 200));
  const compact = trimmed.toLowerCase().replace(/[\s-]/g, "");
  const like = `%${trimmed.toLowerCase()}%`;
  const likeCompact = `%${compact}%`;

  const scope = setScopedWhere({
    setColumn: "p.set_code",
    setId,
    textClause: trimmed
      ? `LOWER(t.full_name) LIKE ?
           OR LOWER(COALESCE(t.awakened_name, '')) LIKE ?
           OR LOWER(p.number)    LIKE ?
           OR LOWER(p.print_key) LIKE ?
           OR LOWER(p.set_code || '-' || p.number) LIKE ?
           OR (p.grouping IS NOT NULL AND LOWER(p.set_code || '-' || p.number || '_' || p.grouping) LIKE ?)`
      : null,
    textParams: [like, like, likeCompact, likeCompact, like, like],
  });

  const rows = db
    .prepare(
      `${DETAIL_SQL}
        WHERE ${scope.where}
        ORDER BY (t.lang = ?) DESC, p.set_code, p.number, p.grouping
        LIMIT ?`,
    )
    .all(...scope.params, lang, limit * 3) as DbsPrintDetail[];

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
  if (!row) return null;
  return { ...row, harvested: dbsCgFactsFor(row.setCode, row.number) };
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
