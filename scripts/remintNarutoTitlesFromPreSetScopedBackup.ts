/**
 * Remap titles from `catalog.sqlite.pre-set-scoped.bak` onto set-scoped keys.
 *
 * Index-only rebuild drops EN (and other) titles that still carried legacy
 * family keys and failed the first expand pass.
 *
 *   pnpm tsx scripts/remintNarutoTitlesFromPreSetScopedBackup.ts
 */
import "dotenv/config";

import { existsSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { parsePrintKey } from "@/core/identify/printKey";
import {
  isNarutoCatalogueSetCode,
  narutoDiskCardId,
} from "@/providers/naruto/narutocarddass/identity";
import { narutoPackDbPath } from "@/providers/naruto/narutocarddass/indexStore";

function collectorFromPrintKey(printKey: string): string {
  const parsed = parsePrintKey(printKey);
  if (!parsed || parsed.game !== "naruto") return printKey.toLowerCase();
  const raw = isNarutoCatalogueSetCode(parsed.set)
    ? parsed.grouping
      ? `${parsed.number}-${parsed.grouping}`
      : parsed.number
    : `${parsed.set}${parsed.number}${
        parsed.grouping ? `-${parsed.grouping}` : ""
      }`;
  return (narutoDiskCardId(raw) ?? raw).toLowerCase();
}

/** Mirror `writeNarutoCcgIndex` — no FR titles on EN-only series keys. */
function setAcceptsTitleLang(setCode: string, lang: string): boolean {
  const l = lang.trim().toLowerCase();
  const set = setCode.trim().toLowerCase();
  if (!l || !set) return true;
  if (l === "en" || l === "ja") return true;
  if (l !== "fr") return true;
  if (set === "promo" || set === "prerelease") return true;
  if (set === "s6" || set === "s11" || set === "s24" || set === "s28") {
    return true;
  }
  const series = /^s(\d+)$/.exec(set);
  if (series) {
    const n = Number(series[1]);
    return n >= 1 && n <= 5;
  }
  return false;
}

function main(): void {
  const dbPath = narutoPackDbPath();
  const backupPath = `${dbPath}.pre-set-scoped.bak`;
  if (!existsSync(dbPath) || !existsSync(backupPath)) {
    console.error(`need ${dbPath} and ${backupPath}`);
    process.exit(1);
  }

  const neu = new DatabaseSync(dbPath);
  const old = new DatabaseSync(backupPath, { readOnly: true });

  const keysByCollector = new Map<string, string[]>();
  for (const row of neu
    .prepare(`SELECT print_key AS printKey, number FROM prints`)
    .all() as { printKey: string; number: string }[]) {
    const c = (narutoDiskCardId(row.number) ?? row.number).toLowerCase();
    const list = keysByCollector.get(c) ?? [];
    list.push(row.printKey);
    keysByCollector.set(c, list);
  }

  const insert = neu.prepare(`
    INSERT INTO print_titles (print_key, lang, full_name, rarity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(print_key, lang) DO UPDATE SET
      full_name = COALESCE(excluded.full_name, print_titles.full_name),
      rarity = COALESCE(excluded.rarity, print_titles.rarity)
  `);

  let written = 0;
  let skipped = 0;
  let blockedFr = 0;
  neu.exec("BEGIN");
  for (const row of old
    .prepare(
      `SELECT print_key AS printKey, lang, full_name AS fullName, rarity
         FROM print_titles`,
    )
    .all() as {
    printKey: string;
    lang: string;
    fullName: string | null;
    rarity: string | null;
  }[]) {
    const keys = keysByCollector.get(collectorFromPrintKey(row.printKey));
    if (!keys?.length) {
      skipped += 1;
      continue;
    }
    for (const printKey of keys) {
      const set = parsePrintKey(printKey)?.set ?? "";
      if (!setAcceptsTitleLang(set, row.lang)) {
        blockedFr += 1;
        continue;
      }
      insert.run(printKey, row.lang, row.fullName, row.rarity);
      written += 1;
    }
  }
  neu.exec("COMMIT");
  old.close();
  neu.close();
  console.log(
    JSON.stringify({
      backup: path.basename(backupPath),
      written,
      skipped,
      blockedFr,
    }),
  );
}

main();
