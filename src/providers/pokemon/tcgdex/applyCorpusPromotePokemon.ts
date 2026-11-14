/**
 * Admin-confirmed shelf → Pokémon identity corpus (`catalog.sqlite`).
 * Same contract as LocalPrintsIndex promote, different schema (TCGdex).
 */
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { parsePrintKey } from "@/core/identify/printKey";
import type {
  CorpusPromoteApplyInput,
  CorpusPromoteApplyResult,
} from "@/types/providerModule";

import { POKEMON_GAME } from "./fetch";
import {
  tcgdexDbPath,
  writeTcgdexSet,
  type TcgdexSetRow,
} from "./indexStore";

function readExistingSet(
  dbPath: string,
  setId: string,
  lang: string,
): TcgdexSetRow | null {
  if (!existsSync(dbPath)) return null;
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch {
    return null;
  }
  try {
    const row = db
      .prepare(
        `SELECT set_id AS setId, lang, name, serie_name AS serieName,
                released_at AS releasedAt, total_count AS totalCount,
                official_count AS officialCount
           FROM sets
          WHERE LOWER(set_id) = LOWER(?) AND lang = ?
          LIMIT 1`,
      )
      .get(setId, lang) as
      | {
          setId: string;
          lang: string;
          name: string;
          serieName: string | null;
          releasedAt: string | null;
          totalCount: number | null;
          officialCount: number | null;
        }
      | undefined;
    if (!row) return null;
    return {
      setId: row.setId,
      lang: row.lang,
      name: row.name,
      serieName: row.serieName,
      releasedAt: row.releasedAt,
      totalCount: row.totalCount,
      officialCount: row.officialCount,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * Write one accepted promote into TCGdex identity. Reuses set metadata when
 * present so Sync titles are not clobbered by a stub name.
 */
export function applyCorpusPromotePokemon(
  input: CorpusPromoteApplyInput,
): CorpusPromoteApplyResult {
  const printKey = input.printKey.trim().toLowerCase();
  if (!printKey) {
    return { written: false, reason: "printKey required" };
  }
  const parsed = parsePrintKey(printKey);
  if (!parsed) {
    return { written: false, reason: `unparseable printKey: ${printKey}` };
  }
  if (parsed.game !== POKEMON_GAME) {
    return {
      written: false,
      reason: `printKey game ${parsed.game} ≠ corpus ${POKEMON_GAME}`,
    };
  }

  const lang = (input.language?.trim() || "fr").toLowerCase();
  const localId = parsed.grouping
    ? `${parsed.number}-${parsed.grouping}`
    : parsed.number;
  const providerId = `${parsed.set}-${localId}`;
  const fullName =
    input.title?.trim() ||
    `${parsed.set.toUpperCase()}-${localId.toUpperCase()}`;

  const dbPath = tcgdexDbPath();
  const existing = readExistingSet(dbPath, parsed.set, lang);
  const setRow: TcgdexSetRow = existing ?? {
    setId: parsed.set,
    lang,
    name: parsed.set.toUpperCase(),
    serieName: null,
    releasedAt: null,
    totalCount: null,
    officialCount: null,
  };

  // writeTcgdexSet creates schema on a cold pack.
  writeTcgdexSet({
    dbPath,
    set: setRow,
    prints: [
      {
        printKey,
        setId: parsed.set,
        localId,
        providerId,
        imageBaseUrl: null,
        printed: true,
      },
    ],
    titles: [
      {
        printKey,
        lang,
        name: fullName,
        setName: setRow.name,
        serieName: setRow.serieName,
      },
    ],
  });

  return { written: true, printKey };
}
