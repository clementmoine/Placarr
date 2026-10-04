/**
 * Collapse duplicate dbsjcc printKeys (same face across series) onto
 * canonical keys + `print_sets`, with a/b/c letters for distinct arts.
 *
 * Idempotent — safe to run on every pipeline seed.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  assetsCardUrl,
  cardDiskIdFromPrintKey,
  rewriteAssetUrlForPrintKeyChange,
} from "@/lib/packAssetUrls";
import { packCardsDir, packCatalogDb, packDataDir } from "@/lib/packPaths";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { migrateProductsSchema } from "@/providers/shared/sealedProducts/productsSqlite";

import {
  buildDbsjccCanonicalMap,
  preferredFaceFile,
  type DbsjccCanonicalPrint,
} from "../canonicalPrint";
import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "../pack";

export type DedupePrintSetsReport = {
  canonical: number;
  aliasesRemoved: number;
  printSets: number;
  productsRemapped: number;
  itemsRemapped: number;
  aliasLedgerPath: string;
};

function cardFolder(number: string, grouping: string | null): string {
  return grouping ? `${number}-${grouping}` : number;
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function moveCardTree(
  print: DbsjccCanonicalPrint,
  packId: string,
): void {
  const destCard = cardFolder(print.number, print.grouping);
  for (const lang of ["fr", "ja", "en"]) {
    const destDir = path.join(
      packCardsDir(packId),
      print.homeSet,
      lang,
      destCard,
    );
    ensureDir(destDir);
    const baseNum = print.number.replace(/[a-z]+$/i, "");
    for (const setCode of print.setCodes) {
      for (const folder of [
        destCard,
        cardFolder(baseNum, print.grouping),
        print.number,
        baseNum,
      ]) {
        const srcDir = path.join(packCardsDir(packId), setCode, lang, folder);
        if (!existsSync(srcDir)) continue;
        if (path.resolve(srcDir) === path.resolve(destDir)) continue;
        for (const file of readdirSync(srcDir)) {
          const from = path.join(srcDir, file);
          const to = path.join(destDir, file);
          if (!existsSync(to)) {
            try {
              renameSync(from, to);
            } catch {
              copyFileSync(from, to);
              rmSync(from, { force: true });
            }
          } else {
            // Dest already has the face — drop the member-set duplicate so
            // re-scans do not invent a second home for the same hash.
            rmSync(from, { force: true });
          }
        }
        try {
          if (readdirSync(srcDir).length === 0) {
            rmSync(srcDir, { recursive: true, force: true });
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function rewriteSqlite(
  packId: string,
  prints: readonly DbsjccCanonicalPrint[],
  aliasToCanonical: Map<string, string>,
): { aliasesRemoved: number; printSets: number; productsRemapped: number } {
  const dbPath = packCatalogDb(packId);
  if (!existsSync(dbPath)) {
    return { aliasesRemoved: 0, printSets: 0, productsRemapped: 0 };
  }

  const index = createLocalPrintsIndex(packId);
  const db = index.openForWrite();
  let aliasesRemoved = 0;
  let printSets = 0;
  let productsRemapped = 0;

  try {
    migrateProductsSchema(db);
    db.exec("BEGIN IMMEDIATE");

    const insertPrint = db.prepare(
      `INSERT INTO prints (print_key, set_code, number, card_type, grouping, source_url, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(print_key) DO UPDATE SET
         set_code = excluded.set_code,
         number = excluded.number,
         card_type = excluded.card_type,
         grouping = excluded.grouping`,
    );
    const insertSet = db.prepare(
      `INSERT INTO print_sets (print_key, set_code)
       VALUES (?, ?)
       ON CONFLICT(print_key, set_code) DO NOTHING`,
    );
    const selectTitles = db.prepare(
      `SELECT lang, full_name AS fullName, rarity FROM print_titles WHERE print_key = ?`,
    );
    const selectAssets = db.prepare(
      `SELECT lang, art, thumb, back, source_url AS sourceUrl, printed
         FROM print_assets WHERE print_key = ?`,
    );
    const insertTitle = db.prepare(
      `INSERT INTO print_titles (print_key, lang, full_name, rarity)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(print_key, lang) DO UPDATE SET
         full_name = COALESCE(excluded.full_name, print_titles.full_name),
         rarity = CASE
           WHEN excluded.rarity IS NOT NULL
            AND (LOWER(excluded.rarity) LIKE '%holo%' OR LOWER(excluded.rarity) = 'prism')
           THEN excluded.rarity
           ELSE COALESCE(print_titles.rarity, excluded.rarity)
         END`,
    );
    const insertAsset = db.prepare(
      `INSERT INTO print_assets (print_key, lang, art, thumb, back, source_url, printed)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(print_key, lang) DO UPDATE SET
         art = COALESCE(print_assets.art, excluded.art),
         thumb = COALESCE(print_assets.thumb, excluded.thumb),
         back = COALESCE(print_assets.back, excluded.back)`,
    );

    const existing = db
      .prepare(`SELECT print_key AS printKey, set_code AS setCode, number, grouping, card_type AS cardType, source_url AS sourceUrl, category FROM prints`)
      .all() as Array<{
      printKey: string;
      setCode: string;
      number: string;
      grouping: string | null;
      cardType: string;
      sourceUrl: string | null;
      category: string | null;
    }>;
    const byKey = new Map(existing.map((row) => [row.printKey, row]));

    for (const print of prints) {
      const cardType = print.number.startsWith("sp") ? "sp" : "d";
      const donors = [print.printKey, ...print.aliasPrintKeys]
        .map((key) => byKey.get(key))
        .filter(Boolean);
      const sourceUrl =
        donors.find((d) => d!.sourceUrl)?.sourceUrl ?? null;
      const category = donors.find((d) => d!.category)?.category ?? null;

      insertPrint.run(
        print.printKey,
        print.homeSet,
        print.number,
        cardType,
        print.grouping,
        sourceUrl,
        category,
      );

      for (const setCode of print.setCodes) {
        insertSet.run(print.printKey, setCode);
        printSets += 1;
      }

      for (const donorKey of [print.printKey, ...print.aliasPrintKeys]) {
        for (const title of selectTitles.all(donorKey) as Array<{
          lang: string;
          fullName: string;
          rarity: string | null;
        }>) {
          insertTitle.run(
            print.printKey,
            title.lang,
            title.fullName,
            title.rarity,
          );
        }
        for (const asset of selectAssets.all(donorKey) as Array<{
          lang: string;
          art: string | null;
          thumb: string | null;
          back: string | null;
          sourceUrl: string | null;
          printed: number;
        }>) {
          insertAsset.run(
            print.printKey,
            asset.lang,
            asset.art,
            asset.thumb,
            asset.back,
            asset.sourceUrl,
            asset.printed,
          );
        }
      }

      // Point preferred FR art at the home-set file name when present.
      const homeFace = preferredFaceFile(
        path.join(
          packCardsDir(packId),
          print.homeSet,
          "fr",
          cardFolder(print.number, print.grouping),
        ),
      );
      if (homeFace) {
        insertAsset.run(
          print.printKey,
          "fr",
          path.basename(homeFace),
          null,
          null,
          null,
          1,
        );
      }
    }

    const keep = new Set(prints.map((p) => p.printKey));
    for (const row of existing) {
      if (keep.has(row.printKey)) continue;
      const canonical = aliasToCanonical.get(row.printKey);
      if (canonical && keep.has(canonical)) {
        db.prepare(`DELETE FROM print_assets WHERE print_key = ?`).run(
          row.printKey,
        );
        db.prepare(`DELETE FROM print_titles WHERE print_key = ?`).run(
          row.printKey,
        );
        db.prepare(`DELETE FROM print_sets WHERE print_key = ?`).run(
          row.printKey,
        );
        db.prepare(`DELETE FROM prints WHERE print_key = ?`).run(row.printKey);
        aliasesRemoved += 1;
      }
    }

    const contentRows = db
      .prepare(`SELECT id, print_key AS printKey FROM product_contents WHERE print_key IS NOT NULL`)
      .all() as Array<{ id: number; printKey: string }>;
    const updateContent = db.prepare(
      `UPDATE product_contents SET print_key = ? WHERE id = ?`,
    );
    for (const row of contentRows) {
      const next = aliasToCanonical.get(row.printKey.trim().toLowerCase());
      if (!next || next === row.printKey.trim().toLowerCase()) continue;
      updateContent.run(next, row.id);
      productsRemapped += 1;
    }

    // Persist alias map for legacy lookup.
    const payload = {
      version: 1 as const,
      observed: new Date().toISOString().slice(0, 10),
      aliases: Object.fromEntries(aliasToCanonical),
    };
    db.prepare(
      `INSERT INTO pack_documents (doc_key, payload_json, updated_at)
       VALUES ('print_key_aliases', ?, ?)
       ON CONFLICT(doc_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
    ).run(JSON.stringify(payload), new Date().toISOString());

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    db.close();
    index.resetCache();
  }

  return { aliasesRemoved, printSets, productsRemapped };
}

async function remapPrismaItems(
  aliasToCanonical: Map<string, string>,
): Promise<number> {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    const aliases = [...aliasToCanonical.entries()].filter(
      ([from, to]) => from !== to,
    );
    let remapped = 0;
    for (const [from, to] of aliases) {
      const items = await prisma.item.findMany({
        where: { printKey: from },
        select: {
          id: true,
          shelfId: true,
          variant: true,
          language: true,
          imageUrl: true,
          metadataId: true,
          metadata: { select: { id: true, imageUrl: true } },
        },
      });
      for (const item of items) {
        const clash = await prisma.item.findFirst({
          where: {
            shelfId: item.shelfId,
            printKey: to,
            language: item.language,
            variant: item.variant,
          },
          select: { id: true },
        });
        if (clash) {
          await prisma.item.delete({ where: { id: item.id } });
        } else {
          const nextImage = rewriteAssetUrlForPrintKeyChange(
            item.imageUrl,
            from,
            to,
            item.language,
          );
          await prisma.item.update({
            where: { id: item.id },
            data: {
              printKey: to,
              ...(nextImage !== item.imageUrl
                ? { imageUrl: nextImage ?? null }
                : {}),
            },
          });
          if (
            item.metadata &&
            item.metadata.imageUrl &&
            item.metadata.imageUrl !== nextImage
          ) {
            const metaImage = rewriteAssetUrlForPrintKeyChange(
              item.metadata.imageUrl,
              from,
              to,
              item.language,
            );
            if (metaImage !== item.metadata.imageUrl) {
              await prisma.metadata.update({
                where: { id: item.metadata.id },
                data: { imageUrl: metaImage ?? null },
              });
            }
          }
        }
        remapped += 1;
      }
    }

    // First migration only rewrote printKey — repair stale card-folder URLs.
    remapped += await repairStalePrintAssetUrls(
      prisma as unknown as RepairPrisma,
    );
    return remapped;
  } catch {
    // No DB / prisma unavailable in some test contexts.
    return 0;
  }
}

type RepairPrisma = {
  item: {
    // PrismaClient method signatures are invariant on args; keep this loose.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: (args?: any) => Promise<
      Array<{
        id: string;
        printKey: string | null;
        language: string | null;
        imageUrl: string | null;
        metadata: { id: string; imageUrl: string | null } | null;
      }>
    >;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<unknown>;
  };
  metadata: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<unknown>;
  };
};

/** Point item/metadata imageUrl at the folder that matches the current printKey. */
async function repairStalePrintAssetUrls(
  prisma: RepairPrisma,
): Promise<number> {
  const items = await prisma.item.findMany({
    where: { printKey: { startsWith: "dbsjcc:" } },
    select: {
      id: true,
      printKey: true,
      language: true,
      imageUrl: true,
      metadata: { select: { id: true, imageUrl: true } },
    },
  });
  let fixed = 0;
  for (const item of items) {
    if (!item.printKey || !item.imageUrl) continue;
    const repaired = repairAssetUrlToPrintKey(
      item.imageUrl,
      item.printKey,
      item.language,
    );
    let touched = false;
    if (repaired && repaired !== item.imageUrl) {
      await prisma.item.update({
        where: { id: item.id },
        data: { imageUrl: repaired },
      });
      touched = true;
    }
    if (item.metadata?.imageUrl) {
      const metaRepaired = repairAssetUrlToPrintKey(
        item.metadata.imageUrl,
        item.printKey,
        item.language,
      );
      if (metaRepaired && metaRepaired !== item.metadata.imageUrl) {
        await prisma.metadata.update({
          where: { id: item.metadata.id },
          data: { imageUrl: metaRepaired },
        });
        touched = true;
      }
    }
    if (touched) fixed += 1;
  }
  return fixed;
}

function repairAssetUrlToPrintKey(
  url: string,
  printKey: string,
  langHint?: string | null,
): string | null {
  const langMatch = /\/cards\/[^/]+\/([^/]+)\//i.exec(url);
  const lang = (langMatch?.[1] ?? langHint ?? "fr").toLowerCase();
  const disk = cardDiskIdFromPrintKey(printKey, lang);
  if (!disk) return null;
  const file = path.basename(url.split("?")[0] ?? url);
  if (!file || file === url) return null;
  const packMatch = /^\/assets\/([^/]+(?:\/[^/]+)*)\/cards\//i.exec(url);
  const pack = packMatch?.[1] ?? DBS_JCC_PACK_ID;
  const next = assetsCardUrl(pack, disk, file);
  const abs = path.join(
    packDataDir(pack),
    "cards",
    disk.set,
    disk.lang,
    disk.card,
    file,
  );
  if (!existsSync(abs)) return null;
  return next;
}

export async function dedupeDbsjccPrintSets(
  packId: string = DBS_JCC_PACK_ID,
): Promise<DedupePrintSetsReport> {
  const { prints, aliasToCanonical } = buildDbsjccCanonicalMap();
  for (const print of prints) {
    moveCardTree(print, packId);
  }
  purgeOrphanListingDirs(packId, prints);
  const sqlite = rewriteSqlite(packId, prints, aliasToCanonical);
  const itemsRemapped = await remapPrismaItems(aliasToCanonical);

  const aliasLedgerPath = path.join(
    dbsJccCuratedDir(),
    "sources",
    "print-key-aliases.json",
  );
  ensureDir(path.dirname(aliasLedgerPath));
  writeFileSync(
    aliasLedgerPath,
    `${JSON.stringify(
      {
        version: 1,
        observed: new Date().toISOString().slice(0, 10),
        aliases: Object.fromEntries(
          [...aliasToCanonical.entries()].filter(([from, to]) => from !== to),
        ),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    canonical: prints.length,
    aliasesRemoved: sqlite.aliasesRemoved,
    printSets: sqlite.printSets,
    productsRemapped: sqlite.productsRemapped,
    itemsRemapped,
    aliasLedgerPath,
  };
}

/** Drop orphan listing folders that are no longer home for any print. */
export function purgeOrphanListingDirs(
  packId: string = DBS_JCC_PACK_ID,
  prints: readonly DbsjccCanonicalPrint[] = buildDbsjccCanonicalMap().prints,
): number {
  const keep = new Set<string>();
  for (const print of prints) {
    keep.add(
      path.join(print.homeSet, "fr", cardFolder(print.number, print.grouping)),
    );
    keep.add(
      path.join(print.homeSet, "ja", cardFolder(print.number, print.grouping)),
    );
    keep.add(
      path.join(print.homeSet, "en", cardFolder(print.number, print.grouping)),
    );
  }
  const root = packCardsDir(packId);
  if (!existsSync(root)) return 0;
  let removed = 0;
  for (const setCode of readdirSync(root)) {
    if (setCode.includes(".")) continue;
    for (const lang of ["fr", "ja", "en"]) {
      const langDir = path.join(root, setCode, lang);
      if (!existsSync(langDir)) continue;
      for (const folder of readdirSync(langDir)) {
        const rel = path.join(setCode, lang, folder);
        if (keep.has(rel)) continue;
        // Faces live only under the home set; multi-set membership is
        // `print_sets`, not duplicate card folders.
        rmSync(path.join(langDir, folder), { recursive: true, force: true });
        removed += 1;
      }
    }
  }
  return removed;
}
