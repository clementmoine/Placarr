/**
 * CardNexus marketplace faces → `art.cardnexus.*` for Pokémon prints.
 *
 * Fills honest gaps (no local art yet). faceChoice ranks CardNexus below
 * specialized HQ sources; the engine decides which face wins.
 */
import path from "node:path";

import {
  fillCardnexusFaces,
  type CardnexusFaceFillReport,
} from "@/providers/commerce/cardnexus/fillFaces";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";

import {
  refreshPokemonFaceDecision,
  resolvePokemonArtFilename,
} from "../../disk/faceChoice";
import { pokemonPaperCardDir } from "../../disk/paperCardDisk";
import {
  syncTcgdexPrintAssetsFromDisk,
  tcgdexDbPath,
} from "../../indexStore";

export type PokemonCardnexusFillReport = CardnexusFaceFillReport & {
  assetsSynced: number;
};

export type PokemonCardnexusPrintTarget = {
  printKey: string;
  setId: string;
  localId: string;
  lang: string;
};

/** Prints that still lack any ranked face on disk (lang-first paper layout). */
export function listPokemonCardnexusGapTargets(opts?: {
  dbPath?: string;
  languages?: readonly string[];
  setIds?: readonly string[];
  limit?: number;
}): PokemonCardnexusPrintTarget[] {
  const pathToDb = opts?.dbPath ?? tcgdexDbPath();
  if (!existsSync(pathToDb)) return [];
  const langs = (opts?.languages ?? ["ja", "en", "fr"]).map((l) =>
    l.trim().toLowerCase(),
  );
  const db = new DatabaseSync(pathToDb, { readOnly: true });
  try {
    const setFilter = opts?.setIds?.length
      ? `AND lower(p.set_id) IN (${opts.setIds.map(() => "?").join(", ")})`
      : "";
    const langFilter = `AND lower(t.lang) IN (${langs.map(() => "?").join(", ")})`;
    const rows = db
      .prepare(
        `
        SELECT p.print_key AS printKey, p.set_id AS setId, p.local_id AS localId, t.lang AS lang
        FROM prints p
        JOIN print_titles t ON t.print_key = p.print_key
        WHERE 1=1
          ${langFilter}
          ${setFilter}
        ORDER BY t.lang, p.set_id, p.local_id
        `,
      )
      .all(...langs, ...(opts?.setIds ?? []).map((s) => s.toLowerCase())) as Array<{
      printKey: string;
      setId: string;
      localId: string;
      lang: string;
    }>;

    const out: PokemonCardnexusPrintTarget[] = [];
    for (const row of rows) {
      const lang = row.lang.trim().toLowerCase();
      const cardDir = pokemonPaperCardDir({
        setId: row.setId,
        lang,
        localId: row.localId,
      });
      if (resolvePokemonArtFilename(cardDir, lang)) continue;
      out.push({
        printKey: row.printKey,
        setId: row.setId,
        localId: row.localId,
        lang,
      });
      if (opts?.limit && out.length >= opts.limit) break;
    }
    return out;
  } finally {
    db.close();
  }
}

export async function fillPokemonCardnexusFaces(
  opts: {
    force?: boolean;
    cardsRoot?: string;
    languages?: readonly string[];
    setIds?: readonly string[];
    limit?: number;
    prints?: readonly PokemonCardnexusPrintTarget[];
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<PokemonCardnexusFillReport> {
  const prints =
    opts.prints ??
    listPokemonCardnexusGapTargets({
      languages: opts.languages,
      setIds: opts.setIds,
      limit: opts.limit,
    });

  const targets = prints.map((p) => ({
    printKey: p.printKey,
    language: p.lang,
    cardDir: pokemonPaperCardDir({
      setId: p.setId,
      lang: p.lang,
      localId: p.localId,
      cardsRoot: opts.cardsRoot,
    }),
  }));

  const report = await fillCardnexusFaces(targets, {
    force: opts.force,
    alreadyHasFace: (cardDir, language) =>
      Boolean(resolvePokemonArtFilename(cardDir, language ?? "fr")),
    onProgress: opts.onProgress,
  });

  const writtenKeys: string[] = [];
  const byLang = new Map<string, string[]>();
  for (let i = 0; i < prints.length; i++) {
    const p = prints[i]!;
    const cardDir = targets[i]!.cardDir;
    const hasArt =
      existsSync(path.join(cardDir, "art.cardnexus.jpg")) ||
      existsSync(path.join(cardDir, "art.cardnexus.jpeg")) ||
      existsSync(path.join(cardDir, "art.cardnexus.png")) ||
      existsSync(path.join(cardDir, "art.cardnexus.webp"));
    if (!hasArt) continue;
    refreshPokemonFaceDecision(cardDir, p.lang);
    writtenKeys.push(p.printKey);
    const list = byLang.get(p.lang) ?? [];
    list.push(p.printKey);
    byLang.set(p.lang, list);
  }

  let assetsSynced = 0;
  if (writtenKeys.length > 0 && !opts.cardsRoot) {
    for (const [lang, keys] of byLang) {
      assetsSynced += syncTcgdexPrintAssetsFromDisk({
        printKeys: keys,
        languages: [lang],
      });
    }
  }

  return { ...report, assetsSynced };
}
