/**
 * Remint Naruto Item.printKey to set-scoped form and clear Item.setCode when
 * the set now lives in the key.
 *
 *   `naruto:ta-0074` + setCode `s3` → `naruto:s3-ta0074`, setCode null
 *   `naruto:n-0392` + setCode `tempete` → `naruto:s11-n0392` (alias)
 *
 * Prefers a reminted key that exists in `catalog.sqlite` when several
 * memberships are possible.
 *
 *   pnpm tsx scripts/migrateNarutoItemPrintKeysSetScoped.ts           # dry-run
 *   pnpm tsx scripts/migrateNarutoItemPrintKeysSetScoped.ts --apply
 */
import "dotenv/config";

import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { parsePrintKey } from "@/core/identify/printKey";
import { prisma } from "@/lib/db/prisma";
import {
  isNarutoCatalogueSetCode,
  mintNarutoPrintKey,
  narutoDiskCardId,
  remintNarutoPrintKeyWithSet,
} from "@/providers/naruto/narutocarddass/identity";
import { narutoPackDbPath } from "@/providers/naruto/narutocarddass/indexStore";
import { loadColekaRampageTornadoLedger } from "@/providers/naruto/narutocarddass/scrape/coleka";
import {
  isNarutoS6FrInediteNumber,
  isNarutoS6FrPrintedNumber,
} from "@/providers/naruto/narutocarddass/sources/titles";

const apply = process.argv.includes("--apply");

const RAMPAGE_COLLECTORS = new Set(
  loadColekaRampageTornadoLedger().map((c) =>
    (narutoDiskCardId(c.number) ?? c.number).toLowerCase(),
  ),
);

function isRampageTornadoCollector(collector: string | null): boolean {
  return !!collector && RAMPAGE_COLLECTORS.has(collector);
}

/** Legacy Item.setCode aliases → catalogue set. */
const SET_ALIASES: Record<string, string> = {
  tempete: "s11",
  "tempete-approche": "s11",
  rampage: "s11",
  "rampage-tornado": "s11",
};

function normalizeCatalogueSet(raw: string | null | undefined): string | null {
  const s = raw?.trim().toLowerCase() || "";
  if (!s) return null;
  const aliased = SET_ALIASES[s] ?? s;
  return isNarutoCatalogueSetCode(aliased) ? aliased : null;
}

function collectorOf(printKey: string): string | null {
  const parsed = parsePrintKey(printKey);
  if (!parsed || parsed.game !== "naruto") return null;
  const raw = isNarutoCatalogueSetCode(parsed.set)
    ? parsed.grouping
      ? `${parsed.number}-${parsed.grouping}`
      : parsed.number
    : `${parsed.set}${parsed.number}${
        parsed.grouping ? `-${parsed.grouping}` : ""
      }`;
  return (narutoDiskCardId(raw) ?? raw).toLowerCase();
}

function loadCatalogueKeysByCollector(): Map<string, string[]> {
  const dbPath = narutoPackDbPath();
  const out = new Map<string, string[]>();
  if (!existsSync(dbPath)) return out;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  for (const row of db
    .prepare(`SELECT print_key AS printKey, number FROM prints`)
    .all() as { printKey: string; number: string }[]) {
    const c = (narutoDiskCardId(row.number) ?? row.number).toLowerCase();
    const list = out.get(c) ?? [];
    list.push(row.printKey);
    out.set(c, list);
  }
  db.close();
  return out;
}

function pickRemint(
  key: string,
  preferredSet: string | null,
  keysByCollector: Map<string, string[]>,
): string | null {
  const collector = collectorOf(key);
  const candidates = collector ? keysByCollector.get(collector) ?? [] : [];

  /*
    Kana / DVD S6 FR inedites are catalogue `s6-*` only (not s5). Prefer that
    membership even when Item.setCode still said s5.
  */
  if (collector && isNarutoS6FrInediteNumber(collector)) {
    const s6 = mintNarutoPrintKey(collector, "s6");
    if (s6 && candidates.includes(s6)) return s6;
  }

  /*
    Kana blister reprints (ta0227, …): MIJ S6 vs retail S5. Prefer `s6-*`
    when Item.setCode already says s6 (or tempete-style alias cleared).
  */
  if (
    collector &&
    isNarutoS6FrPrintedNumber(collector) &&
    preferredSet === "s6"
  ) {
    const s6 = mintNarutoPrintKey(collector, "s6");
    if (s6 && candidates.includes(s6)) return s6;
  }

  /*
    Tempête / Rampage Tornado: Item.setCode `tempete` → s11. Prefer the
    catalogue `s11-*` row over an earlier-series reprint key.
  */
  if (collector && isRampageTornadoCollector(collector) && preferredSet === "s11") {
    const s11 = mintNarutoPrintKey(collector, "s11");
    if (s11 && candidates.includes(s11)) return s11;
  }

  if (preferredSet) {
    const want = remintNarutoPrintKeyWithSet(key, preferredSet);
    if (want && candidates.includes(want)) return want;
    const prefix = `naruto:${preferredSet}-`;
    const match = candidates.find((k) => k.startsWith(prefix));
    if (match) return match;
    /*
      Tempête reprints often already exist under an earlier series only.
      Prefer a real catalogue row so the checklist can tick; never leave a
      ghost `s11-*` that is absent from sqlite.
    */
    if (candidates.length > 0) return candidates[0]!;
    if (want) return want;
  }

  if (candidates.length === 1) return candidates[0]!;
  return null;
}

async function main(): Promise<void> {
  const keysByCollector = loadCatalogueKeysByCollector();
  const items = await prisma.item.findMany({
    where: { printKey: { startsWith: "naruto:" } },
    select: {
      id: true,
      printKey: true,
      setCode: true,
      slug: true,
      name: true,
    },
  });

  let reminted = 0;
  let clearedSet = 0;
  let skipped = 0;
  const samples: string[] = [];

  for (const item of items) {
    const key = item.printKey?.trim() ?? "";
    if (!key) {
      skipped += 1;
      continue;
    }
    const parsed = parsePrintKey(key);
    if (!parsed || parsed.game !== "naruto") {
      skipped += 1;
      continue;
    }

    const bodySet = normalizeCatalogueSet(item.setCode);
    let nextKey = key;
    if (!isNarutoCatalogueSetCode(parsed.set)) {
      const remintedKey = pickRemint(key, bodySet, keysByCollector);
      if (!remintedKey) {
        skipped += 1;
        continue;
      }
      nextKey = remintedKey;
    } else {
      /*
        Already set-scoped but wrong chapter (ghost `s5-ni0232` for a Kana
        insert that only exists as `s6-ni0232` in the catalogue).
      */
      const collector = collectorOf(key);
      const candidates = keysByCollector.get(collector ?? "") ?? [];
      if (collector && isNarutoS6FrInediteNumber(collector) && parsed.set !== "s6") {
        const s6 = mintNarutoPrintKey(collector, "s6");
        if (s6 && candidates.includes(s6)) nextKey = s6;
      }
      if (
        collector &&
        isRampageTornadoCollector(collector) &&
        parsed.set !== "s11" &&
        bodySet === "s11"
      ) {
        const s11 = mintNarutoPrintKey(collector, "s11");
        if (s11 && candidates.includes(s11)) nextKey = s11;
      }
    }

    const nextSet = isNarutoCatalogueSetCode(parsePrintKey(nextKey)?.set ?? "")
      ? null
      : item.setCode;

    if (nextKey === key && nextSet === item.setCode) {
      skipped += 1;
      continue;
    }

    reminted += nextKey !== key ? 1 : 0;
    clearedSet += nextSet == null && item.setCode ? 1 : 0;
    if (samples.length < 12) {
      samples.push(
        `${item.id}: ${key}+${item.setCode ?? "∅"} → ${nextKey}`,
      );
    }

    if (apply) {
      await prisma.item.update({
        where: { id: item.id },
        data: { printKey: nextKey, setCode: nextSet },
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        apply,
        total: items.length,
        reminted,
        clearedSet,
        skipped,
        samples,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
