/**
 * Fill `art.cardnexus.*` gaps for any local TCG pack CardNexus catalogues.
 *
 * Enumerates `catalog.sqlite` prints missing art, resolves disk layout
 * (lang-first or set-first), downloads CardNexus `imageUrl`, upserts
 * `print_assets`. faceChoice / catalogueFaceRankScore decide display.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { parsePrintKey } from "@/core/identify/printKey";
import { packCardsDir, packCatalogDb } from "@/lib/packPaths";

import { cardnexusApiKey } from "./client";
import {
  fillCardnexusFaces,
  type CardnexusFaceFillReport,
} from "./fillFaces";
import { cardnexusGameIdForPrintGame } from "./games";

export type CardnexusPackFillReport = CardnexusFaceFillReport & {
  packId: string;
  printGame: string;
  assetsUpserted: number;
};

export type CardnexusPackPrintTarget = {
  printKey: string;
  lang: string;
  setCode: string;
  number: string;
  grouping: string | null;
};

type DiskLayout = "lang-first" | "set-first";

function cardFolderId(number: string, grouping: string | null): string {
  const n = number.trim().toLowerCase();
  const g = grouping?.trim().toLowerCase();
  return g ? `${n}-${g}` : n;
}

function detectPackLayout(packId: string): DiskLayout {
  const root = packCardsDir(packId);
  if (!existsSync(root)) return "set-first";
  try {
    for (const name of readdirSync(root)) {
      const abs = path.join(root, name);
      if (!statSync(abs).isDirectory()) continue;
      if (/^[a-z]{2}(-[a-z]{2})?$/i.test(name)) return "lang-first";
      // set codes often contain digits or are longer than a lang tag
      return "set-first";
    }
  } catch {
    /* default */
  }
  return "set-first";
}

export function cardnexusPackCardDir(opts: {
  packId: string;
  lang: string;
  setCode: string;
  number: string;
  grouping?: string | null;
  layout?: DiskLayout;
}): string {
  const lang = opts.lang.trim().toLowerCase();
  const set = opts.setCode.trim().toLowerCase();
  const card = cardFolderId(opts.number, opts.grouping ?? null);
  const root = packCardsDir(opts.packId);
  const langFirst = path.join(root, lang, set, card);
  const setFirst = path.join(root, set, lang, card);
  if (existsSync(langFirst)) return langFirst;
  if (existsSync(setFirst)) return setFirst;
  const layout = opts.layout ?? detectPackLayout(opts.packId);
  return layout === "lang-first" ? langFirst : setFirst;
}

function hasAnyArt(cardDir: string): boolean {
  if (!existsSync(cardDir) || !statSync(cardDir).isDirectory()) return false;
  try {
    return readdirSync(cardDir).some((name) => {
      const low = name.toLowerCase();
      return (
        low.startsWith("art.") &&
        !low.includes("reconstructed") &&
        /\.(webp|jpe?g|png|gif)$/i.test(low)
      );
    });
  } catch {
    return false;
  }
}

function tableColumns(db: DatabaseSync, table: string): Set<string> {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    return new Set(rows.map((r) => r.name));
  } catch {
    return new Set();
  }
}

/** Lorcana uses `promo_grouping`; local TCG line uses `grouping`. */
function groupingSelectSql(printCols: ReadonlySet<string>): string {
  if (printCols.has("grouping")) return "p.grouping AS grouping";
  if (printCols.has("promo_grouping")) {
    return "p.promo_grouping AS grouping";
  }
  return "NULL AS grouping";
}

/**
 * Prints that have a title but no usable local art for that locale.
 */
export function listCardnexusPackGapTargets(opts: {
  packId: string;
  printGame: string;
  languages?: readonly string[];
  setIds?: readonly string[];
  limit?: number;
}): CardnexusPackPrintTarget[] {
  if (!cardnexusGameIdForPrintGame(opts.printGame)) return [];
  const dbPath = packCatalogDb(opts.packId);
  if (!existsSync(dbPath)) return [];

  const langs = (opts.languages ?? []).map((l) => l.trim().toLowerCase());
  const setIds = (opts.setIds ?? []).map((s) => s.trim().toLowerCase());
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const printCols = tableColumns(db, "prints");
    const titleCols = tableColumns(db, "print_titles");
    const assetCols = tableColumns(db, "print_assets");
    if (!printCols.has("print_key") || !titleCols.has("print_key")) return [];
    if (!assetCols.has("art")) return [];

    const langClause = langs.length
      ? `AND lower(t.lang) IN (${langs.map(() => "?").join(", ")})`
      : "";
    const setClause = setIds.length
      ? `AND lower(p.set_code) IN (${setIds.map(() => "?").join(", ")})`
      : "";
    const rows = db
      .prepare(
        `
        SELECT p.print_key AS printKey,
               p.set_code AS setCode,
               p.number AS number,
               ${groupingSelectSql(printCols)},
               t.lang AS lang
          FROM prints p
          JOIN print_titles t ON t.print_key = p.print_key
          LEFT JOIN print_assets a
            ON a.print_key = p.print_key AND a.lang = t.lang
         WHERE (a.art IS NULL OR trim(a.art) = '')
           AND lower(p.print_key) LIKE ?
           ${langClause}
           ${setClause}
         ORDER BY t.lang, p.set_code, p.number
        `,
      )
      .all(
        `${opts.printGame.trim().toLowerCase()}:%`,
        ...langs,
        ...setIds,
      ) as Array<{
      printKey: string;
      setCode: string;
      number: string;
      grouping: string | null;
      lang: string;
    }>;

    const layout = detectPackLayout(opts.packId);
    const out: CardnexusPackPrintTarget[] = [];
    for (const row of rows) {
      const parsed = parsePrintKey(row.printKey);
      if (!parsed || parsed.game !== opts.printGame.trim().toLowerCase()) {
        continue;
      }
      const lang = row.lang.trim().toLowerCase();
      const cardDir = cardnexusPackCardDir({
        packId: opts.packId,
        lang,
        setCode: row.setCode,
        number: row.number,
        grouping: row.grouping,
        layout,
      });
      if (hasAnyArt(cardDir)) continue;
      out.push({
        printKey: row.printKey,
        lang,
        setCode: row.setCode,
        number: row.number,
        grouping: row.grouping,
      });
      if (opts.limit && out.length >= opts.limit) break;
    }
    return out;
  } finally {
    db.close();
  }
}

/**
 * Upsert `print_assets.art` across heterogeneous pack schemas (Lorcana has no
 * `source_url`; local TCG line does).
 */
function upsertPackArtBasenames(
  packId: string,
  rows: readonly {
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }[],
): number {
  const dbPath = packCatalogDb(packId);
  if (!existsSync(dbPath) || rows.length === 0) return 0;
  const db = new DatabaseSync(dbPath);
  try {
    const cols = tableColumns(db, "print_assets");
    if (!cols.has("art") || !cols.has("print_key") || !cols.has("lang")) {
      return 0;
    }
    const hasSource = cols.has("source_url");
    const hasPrinted = cols.has("printed");
    const insertCols = ["print_key", "lang", "art"];
    const placeholders = ["?", "?", "?"];
    if (hasSource) {
      insertCols.push("source_url");
      placeholders.push("?");
    }
    if (hasPrinted) {
      insertCols.push("printed");
      placeholders.push("1");
    }
    const updates = ["art = COALESCE(excluded.art, print_assets.art)"];
    if (hasSource) {
      updates.push(
        "source_url = COALESCE(excluded.source_url, print_assets.source_url)",
      );
    }
    const upsert = db.prepare(
      `INSERT INTO print_assets (${insertCols.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT(print_key, lang) DO UPDATE SET ${updates.join(", ")}`,
    );
    const printExists = db.prepare(
      `SELECT 1 AS ok FROM prints WHERE print_key = ? LIMIT 1`,
    );
    let assets = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        const printKey = row.printKey.trim().toLowerCase();
        const lang = row.lang.trim().toLowerCase();
        const art = row.art.trim();
        if (!printKey || !lang || !art) continue;
        if (!printExists.get(printKey)) continue;
        const args: unknown[] = [printKey, lang, art];
        if (hasSource) args.push(row.sourceUrl);
        upsert.run(...args);
        assets += 1;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return assets;
  } finally {
    db.close();
  }
}

/**
 * Download CardNexus faces for catalogue gaps and upsert `print_assets.art`.
 */
export async function fillCardnexusPackFaces(
  opts: {
    packId: string;
    printGame: string;
    force?: boolean;
    languages?: readonly string[];
    setIds?: readonly string[];
    limit?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<CardnexusPackFillReport> {
  const empty: CardnexusPackFillReport = {
    packId: opts.packId,
    printGame: opts.printGame,
    prints: 0,
    tried: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    unmapped: 0,
    assetsUpserted: 0,
  };
  if (!cardnexusApiKey()) return empty;
  if (!cardnexusGameIdForPrintGame(opts.printGame)) return empty;

  const layout = detectPackLayout(opts.packId);
  const prints = listCardnexusPackGapTargets(opts);
  const targets = prints.map((p) => ({
    printKey: p.printKey,
    language: p.lang,
    cardDir: cardnexusPackCardDir({
      packId: opts.packId,
      lang: p.lang,
      setCode: p.setCode,
      number: p.number,
      grouping: p.grouping,
      layout,
    }),
  }));

  const report = await fillCardnexusFaces(targets, {
    force: opts.force,
    alreadyHasFace: (cardDir) => hasAnyArt(cardDir),
    onProgress: opts.onProgress,
  });

  const assetRows: Array<{
    printKey: string;
    lang: string;
    art: string;
    sourceUrl: string;
  }> = [];
  for (let i = 0; i < prints.length; i++) {
    const p = prints[i]!;
    const cardDir = targets[i]!.cardDir;
    if (!existsSync(cardDir)) continue;
    let artName: string | null = null;
    try {
      artName =
        readdirSync(cardDir).find((n) =>
          /^art\.cardnexus\.(webp|jpe?g|png)$/i.test(n),
        ) ?? null;
    } catch {
      artName = null;
    }
    if (!artName) continue;
    // Public product fiche only — never the CardNexus homepage.
    const sourceUrl = report.productUrlsByPrintKey[p.printKey]?.trim();
    if (!sourceUrl) continue;
    assetRows.push({
      printKey: p.printKey,
      lang: p.lang,
      art: artName,
      sourceUrl,
    });
  }

  let assetsUpserted = 0;
  if (assetRows.length > 0) {
    assetsUpserted = upsertPackArtBasenames(opts.packId, assetRows);
  }

  return {
    packId: opts.packId,
    printGame: opts.printGame,
    ...report,
    assetsUpserted,
  };
}

/** Soft-fail wrapper for catalogue Sync — never throws into refresh. */
export async function runCardnexusPackFacesStep(opts: {
  packId: string;
  printGame: string;
  languages?: readonly string[];
  limit?: number;
  onLog?: (line: string) => void;
}): Promise<CardnexusPackFillReport | null> {
  if (!cardnexusApiKey()) {
    opts.onLog?.(
      `── CardNexus faces — skipped (CARDNEXUS_API_KEY missing) [${opts.packId}]`,
    );
    return null;
  }
  if (!cardnexusGameIdForPrintGame(opts.printGame)) return null;
  opts.onLog?.(
    `── CardNexus faces — gaps for ${opts.packId} (${opts.printGame})`,
  );
  try {
    const report = await fillCardnexusPackFaces({
      packId: opts.packId,
      printGame: opts.printGame,
      languages: opts.languages,
      limit: opts.limit,
      onProgress: (done, total) => {
        if (done !== total && done % 50 !== 0) return;
        opts.onLog?.(`   cardnexus ${opts.packId} ${done}/${total}`);
      },
    });
    opts.onLog?.(
      `   cardnexus ${opts.packId}: ${report.written} écrites / ${report.skipped} skip / ${report.unmapped} hors map / ${report.failed} fail (${report.prints} cibles, assets ${report.assetsUpserted})`,
    );
    return report;
  } catch (err) {
    opts.onLog?.(
      `   cardnexus ${opts.packId}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/**
 * Wrap a pack pipeline so Catalogue Sync fills CardNexus face gaps after
 * the harvest. Call from the owning provider module (not `providers/shared`).
 */
export function withCardnexusPackFacesStep<T>(
  opts: {
    packId: string;
    printGame: string;
    onLog?: (line: string) => void;
  },
  runPipeline: (argv: string[]) => Promise<T>,
): (argv: string[]) => Promise<T> {
  return async (argv) => {
    const result = await runPipeline(argv);
    const skip = argv.some(
      (a, i) =>
        a === "--skip" &&
        String(argv[i + 1] ?? "")
          .toLowerCase()
          .split(",")
          .some((t) => t.trim() === "cardnexus" || t.trim() === "faces-cardnexus"),
    );
    if (!skip) {
      await runCardnexusPackFacesStep({
        packId: opts.packId,
        printGame: opts.printGame,
        onLog: opts.onLog ?? ((line) => console.log(line)),
      });
    }
    return result;
  };
}
