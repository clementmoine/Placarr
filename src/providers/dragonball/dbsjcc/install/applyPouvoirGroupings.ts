/**
 * Stamp singleton pouvoir groupings onto existing prints
 * (`part4-d0250b` → `part4-d0250b-kaio`) from dbzcollection-pouvoirs.json.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { rewriteAssetUrlForPrintKeyChange } from "@/lib/packAssetUrls";
import { packCardsDir } from "@/lib/packPaths";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { migrateProductsSchema } from "@/providers/shared/sealedProducts/productsSqlite";

import type { DbzcollectionPouvoirRow } from "../harvest/dbzcollectionPouvoirs";
import { dbsJccDbzcollectionPouvoirsPath } from "../harvest/dbzcollectionPouvoirs";
import { DBS_JCC_PACK_ID, dbsJccCuratedDir } from "../pack";
import { dbsjccPrintKey, splitDbsjccNumber } from "../printKey";
import { cardFolderName } from "../scrape/dbzcollection";

export type ApplyPouvoirGroupingsReport = {
  considered: number;
  remapped: number;
  skipped: number;
  itemsRemapped: number;
  aliasesAdded: number;
};

function loadPouvoirs(): DbzcollectionPouvoirRow[] {
  const p = dbsJccDbzcollectionPouvoirsPath();
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as {
    pouvoirs?: DbzcollectionPouvoirRow[];
  };
  return raw.pouvoirs ?? [];
}

function moveFolder(
  packId: string,
  setCode: string,
  fromCard: string,
  toCard: string,
): void {
  if (fromCard === toCard) return;
  for (const lang of ["fr", "ja", "en"]) {
    const src = path.join(packCardsDir(packId), setCode, lang, fromCard);
    const dest = path.join(packCardsDir(packId), setCode, lang, toCard);
    if (!existsSync(src)) continue;
    mkdirSync(dest, { recursive: true });
    if (path.resolve(src) === path.resolve(dest)) continue;
    for (const file of readdirSync(src)) {
      const from = path.join(src, file);
      const to = path.join(dest, file);
      if (!existsSync(to)) {
        try {
          renameSync(from, to);
        } catch {
          copyFileSync(from, to);
          rmSync(from, { force: true });
        }
      } else {
        rmSync(from, { force: true });
      }
    }
    try {
      if (readdirSync(src).length === 0) {
        rmSync(src, { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  }
}

async function remapPrismaItems(
  remaps: ReadonlyArray<{ from: string; to: string }>,
): Promise<number> {
  try {
    const { prisma } = await import("@/lib/db/prisma");
    let remapped = 0;
    for (const { from, to } of remaps) {
      if (from === to) continue;
      const items = await prisma.item.findMany({
        where: { printKey: from },
        select: {
          id: true,
          shelfId: true,
          variant: true,
          language: true,
          imageUrl: true,
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
        const nextImage = rewriteAssetUrlForPrintKeyChange(
          item.imageUrl,
          from,
          to,
          item.language,
        );
        if (clash) {
          await prisma.item.delete({ where: { id: item.id } });
        } else {
          await prisma.item.update({
            where: { id: item.id },
            data: {
              printKey: to,
              ...(nextImage !== item.imageUrl
                ? { imageUrl: nextImage ?? null }
                : {}),
            },
          });
          if (item.metadata?.imageUrl) {
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
    return remapped;
  } catch {
    return 0;
  }
}

function appendAliases(remaps: ReadonlyArray<{ from: string; to: string }>): number {
  const aliasPath = path.join(
    dbsJccCuratedDir(),
    "sources",
    "print-key-aliases.json",
  );
  let aliases: Record<string, string> = {};
  if (existsSync(aliasPath)) {
    try {
      const raw = JSON.parse(readFileSync(aliasPath, "utf8")) as {
        aliases?: Record<string, string>;
      };
      aliases = { ...(raw.aliases ?? {}) };
    } catch {
      aliases = {};
    }
  }
  let added = 0;
  for (const { from, to } of remaps) {
    if (from === to) continue;
    if (aliases[from] !== to) {
      aliases[from] = to;
      added += 1;
    }
  }
  if (added === 0) return 0;
  writeFileSync(
    aliasPath,
    `${JSON.stringify(
      {
        version: 1,
        observed: new Date().toISOString().slice(0, 10),
        aliases,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return added;
}

export async function applyDbsjccPouvoirGroupings(
  packId: string = DBS_JCC_PACK_ID,
): Promise<ApplyPouvoirGroupingsReport> {
  const pouvoirs = loadPouvoirs();
  const index = createLocalPrintsIndex(packId);
  const db = index.openForWrite();
  const remaps: Array<{ from: string; to: string }> = [];
  let considered = 0;
  let skipped = 0;

  try {
    migrateProductsSchema(db);
    db.exec("BEGIN IMMEDIATE");

    const existing = db
      .prepare(
        `SELECT print_key AS printKey, set_code AS setCode, number, grouping,
                card_type AS cardType, source_url AS sourceUrl, category
           FROM prints`,
      )
      .all() as Array<{
      printKey: string;
      setCode: string;
      number: string;
      grouping: string | null;
      cardType: string;
      sourceUrl: string | null;
      category: string | null;
    }>;

    const bySetBase = new Map<string, typeof existing>();
    for (const row of existing) {
      const base = splitDbsjccNumber(row.number)?.base ?? row.number;
      const key = `${row.setCode}|${base}`;
      const list = bySetBase.get(key) ?? [];
      list.push(row);
      bySetBase.set(key, list);
    }

    // SQLite may block rename of PK when FKs exist — delete+insert pattern.
    const insertPrint = db.prepare(
      `INSERT INTO prints (print_key, set_code, number, card_type, grouping, source_url, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(print_key) DO UPDATE SET
         set_code = excluded.set_code,
         number = excluded.number,
         grouping = excluded.grouping`,
    );
    const deletePrint = db.prepare(`DELETE FROM prints WHERE print_key = ?`);
    const moveTitles = db.prepare(
      `UPDATE print_titles SET print_key = ? WHERE print_key = ?`,
    );
    const moveAssets = db.prepare(
      `UPDATE print_assets SET print_key = ? WHERE print_key = ?`,
    );
    const moveSets = db.prepare(
      `UPDATE print_sets SET print_key = ? WHERE print_key = ?`,
    );
    const moveContents = db.prepare(
      `UPDATE product_contents SET print_key = ? WHERE print_key = ?`,
    );

    for (const row of pouvoirs) {
      considered += 1;
      const key = `${row.setCode}|${row.number}`;
      const hits = bySetBase.get(key) ?? [];
      // Already has the target grouping — done.
      if (hits.some((h) => (h.grouping ?? null) === row.grouping)) {
        skipped += 1;
        continue;
      }
      // Only remap a singleton (or lettered singleton) with null grouping.
      const bare = hits.filter((h) => !h.grouping);
      if (bare.length !== 1) {
        skipped += 1;
        continue;
      }
      const current = bare[0]!;
      const nextKey = dbsjccPrintKey(
        current.setCode,
        current.number,
        row.grouping,
      );
      if (!nextKey || nextKey === current.printKey) {
        skipped += 1;
        continue;
      }
      if (existing.some((e) => e.printKey === nextKey)) {
        skipped += 1;
        continue;
      }

      const fromFolder = cardFolderName(current.number, current.grouping);
      const toFolder = cardFolderName(current.number, row.grouping);
      moveFolder(packId, current.setCode, fromFolder, toFolder);

      insertPrint.run(
        nextKey,
        current.setCode,
        current.number,
        current.cardType,
        row.grouping,
        current.sourceUrl,
        current.category,
      );
      moveTitles.run(nextKey, current.printKey);
      moveAssets.run(nextKey, current.printKey);
      try {
        moveSets.run(nextKey, current.printKey);
      } catch {
        /* print_sets may not exist / conflict */
      }
      try {
        moveContents.run(nextKey, current.printKey);
      } catch {
        /* optional */
      }
      deletePrint.run(current.printKey);
      remaps.push({ from: current.printKey, to: nextKey });
      // Keep bySetBase consistent for later rows.
      current.printKey = nextKey;
      current.grouping = row.grouping;
    }

    // Persist aliases into pack_documents too.
    if (remaps.length > 0) {
      const aliasRow = db
        .prepare(
          `SELECT payload_json AS json FROM pack_documents WHERE doc_key = 'print_key_aliases'`,
        )
        .get() as { json?: string } | undefined;
      let aliases: Record<string, string> = {};
      if (aliasRow?.json) {
        try {
          aliases =
            (JSON.parse(aliasRow.json) as { aliases?: Record<string, string> })
              .aliases ?? {};
        } catch {
          aliases = {};
        }
      }
      for (const { from, to } of remaps) aliases[from] = to;
      db.prepare(
        `INSERT INTO pack_documents (doc_key, payload_json, updated_at)
         VALUES ('print_key_aliases', ?, ?)
         ON CONFLICT(doc_key) DO UPDATE SET
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
      ).run(
        JSON.stringify({
          version: 1,
          observed: new Date().toISOString().slice(0, 10),
          aliases,
        }),
        new Date().toISOString(),
      );
    }

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

  const aliasesAdded = appendAliases(remaps);
  const itemsRemapped = await remapPrismaItems(remaps);
  return {
    considered,
    remapped: remaps.length,
    skipped,
    itemsRemapped,
    aliasesAdded,
  };
}
