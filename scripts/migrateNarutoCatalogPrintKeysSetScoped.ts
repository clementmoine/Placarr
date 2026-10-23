/**
 * Rewrite Naruto `catalog.sqlite` printKeys to set-scoped form.
 *
 * `naruto:ta-0074` + print_sets {s2,s3} → `naruto:s2-ta0074` + `naruto:s3-ta0074`
 * (titles/assets duplicated). Legacy keys without memberships use `set_code`.
 *
 *   pnpm tsx scripts/migrateNarutoCatalogPrintKeysSetScoped.ts           # dry-run
 *   pnpm tsx scripts/migrateNarutoCatalogPrintKeysSetScoped.ts --apply
 */
import "dotenv/config";

import { existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  expandNarutoPrintsToSetScoped,
  isNarutoCatalogueSetCode,
  narutoDiskCardId,
  type NarutoPrintRow,
} from "@/providers/naruto/narutocarddass/identity";
import { narutoPackDbPath } from "@/providers/naruto/narutocarddass/indexStore";
import { isNarutoS6FrPrintedNumber } from "@/providers/naruto/narutocarddass/sources/titles";
import { belongsOnNarutoPromoChecklist } from "@/providers/naruto/narutocarddass/sources/promos";

const apply = process.argv.includes("--apply");

function main(): void {
  const dbPath = narutoPackDbPath();
  if (!existsSync(dbPath)) {
    console.error(`missing ${dbPath}`);
    process.exit(1);
  }

  const db = new DatabaseSync(dbPath);
  const prints = db
    .prepare(
      `SELECT print_key AS printKey, set_code AS setCode, number,
              card_type AS cardType, grouping, source_url AS sourceUrl
         FROM prints`,
    )
    .all() as Array<{
    printKey: string;
    setCode: string;
    number: string;
    cardType: string;
    grouping: string | null;
    sourceUrl: string | null;
  }>;

  const memberships = new Map<string, string[]>();
  try {
    for (const row of db
      .prepare(`SELECT print_key AS printKey, set_code AS setCode FROM print_sets`)
      .all() as Array<{ printKey: string; setCode: string }>) {
      const list = memberships.get(row.printKey) ?? [];
      list.push(row.setCode.trim().toLowerCase());
      memberships.set(row.printKey, list);
    }
  } catch {
    /* no print_sets */
  }

  const prepared: NarutoPrintRow[] = prints.map((p) => {
    let sets = [...(memberships.get(p.printKey) ?? [])];
    if (!sets.length && isNarutoCatalogueSetCode(p.setCode)) {
      sets = [p.setCode.trim().toLowerCase()];
    }
    if (isNarutoS6FrPrintedNumber(p.number) && !sets.includes("s6")) {
      sets = [...sets, "s6"];
    }
    sets = sets.filter((set) => {
      if (set === "promo" && !belongsOnNarutoPromoChecklist(p.number)) {
        return false;
      }
      return isNarutoCatalogueSetCode(set);
    });
    return {
      printKey: p.printKey,
      setCode: p.setCode,
      setCodes: sets,
      number: p.number,
      cardType: p.cardType,
      grouping: p.grouping,
      sourceUrl: p.sourceUrl,
    };
  });

  const expanded = expandNarutoPrintsToSetScoped(prepared);
  const alreadyScoped = prints.every((p) =>
    isNarutoCatalogueSetCode(p.printKey.split(":")[1]?.split("-")[0] ?? ""),
  );
  console.log(
    `prints ${prints.length} → expanded ${expanded.length}` +
      (alreadyScoped ? " (looks already scoped)" : ""),
  );

  if (!apply) {
    const sample = expanded.slice(0, 8).map((p) => p.printKey);
    console.log("sample:", sample.join(", "));
    console.log("dry-run — pass --apply to rewrite");
    db.close();
    return;
  }

  const backup = `${dbPath}.pre-set-scoped.bak`;
  copyFileSync(dbPath, backup);
  console.log(`backup ${backup}`);

  const titles = db
    .prepare(
      `SELECT print_key AS printKey, lang, full_name AS fullName, rarity FROM print_titles`,
    )
    .all() as Array<{
    printKey: string;
    lang: string;
    fullName: string;
    rarity: string | null;
  }>;
  const assets = db
    .prepare(
      `SELECT print_key AS printKey, lang, art, thumb, back, source_url AS sourceUrl,
              wayback_timestamp AS waybackTimestamp, printed
         FROM print_assets`,
    )
    .all() as Array<{
    printKey: string;
    lang: string;
    art: string | null;
    thumb: string | null;
    back: string | null;
    sourceUrl: string | null;
    waybackTimestamp: string | null;
    printed: number | null;
  }>;

  const collectorOf = (number: string, printKey: string) =>
    (narutoDiskCardId(number) ?? printKey).toLowerCase();
  const keysByCollector = new Map<string, string[]>();
  for (const p of expanded) {
    const c = collectorOf(p.number, p.printKey);
    const list = keysByCollector.get(c) ?? [];
    list.push(p.printKey);
    keysByCollector.set(c, list);
  }
  const oldCollector = new Map<string, string>();
  for (const p of prints) {
    oldCollector.set(p.printKey, collectorOf(p.number, p.printKey));
  }

  db.exec("BEGIN");
  try {
    db.exec(`DELETE FROM print_sets`);
    db.exec(`DELETE FROM print_titles`);
    db.exec(`DELETE FROM print_assets`);
    db.exec(`DELETE FROM prints`);

    const insertPrint = db.prepare(
      `INSERT INTO prints (print_key, set_code, number, card_type, grouping, source_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertSet = db.prepare(
      `INSERT INTO print_sets (print_key, set_code) VALUES (?, ?)`,
    );
    const insertTitle = db.prepare(
      `INSERT INTO print_titles (print_key, lang, full_name, rarity)
       VALUES (?, ?, ?, ?)`,
    );
    const insertAsset = db.prepare(
      `INSERT INTO print_assets (print_key, lang, art, thumb, back, source_url, wayback_timestamp, printed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const p of expanded) {
      insertPrint.run(
        p.printKey,
        p.setCode,
        p.number,
        p.cardType,
        p.grouping ?? null,
        p.sourceUrl ?? null,
      );
      if (!/^maki\d+$/i.test(p.setCode)) {
        insertSet.run(p.printKey, p.setCode);
      }
    }

    for (const t of titles) {
      const c = oldCollector.get(t.printKey);
      if (!c) continue;
      for (const printKey of keysByCollector.get(c) ?? []) {
        insertTitle.run(printKey, t.lang, t.fullName, t.rarity);
      }
    }
    for (const a of assets) {
      const c = oldCollector.get(a.printKey);
      if (!c) continue;
      for (const printKey of keysByCollector.get(c) ?? []) {
        insertAsset.run(
          printKey,
          a.lang,
          a.art,
          a.thumb,
          a.back,
          a.sourceUrl,
          a.waybackTimestamp,
          a.printed ?? 1,
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    copyFileSync(backup, dbPath);
    throw error;
  }
  db.close();
  console.log(`wrote ${expanded.length} set-scoped prints → ${dbPath}`);
}

main();
