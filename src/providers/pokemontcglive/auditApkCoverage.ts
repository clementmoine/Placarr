#!/usr/bin/env tsx
/**
 * APK-first coverage audit: every printable card id in config-cache must be in
 * our regenerated catalogue. Optionally report scrape gaps vs cards.json.
 *
 *   tsx scripts/pokemon/auditApkCoverage.ts
 *   tsx scripts/pokemon/auditApkCoverage.ts --strict-scrape
 *   tsx scripts/pokemon/auditApkCoverage.ts --write-catalogue
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  catalogueSetnumsFromConfig,
  collectApkSetnumPairs,
  hasPair,
  type SetNumPairKey,
} from "@/providers/pokemontcglive/cdn";
import { repoRoot } from "@/providers/shared/foilPaths";

export type AuditApkPaths = {
  root: string;
  configCache: string;
  cataloguePath: string;
  cardsPath: string;
  bundlesDir: string;
  reportPath: string;
};

export function defaultAuditPaths(root = repoRoot()): AuditApkPaths {
  const pack = path.join(root, "data/pokemon");
  const staging = path.join(pack, "staging");
  return {
    root,
    configCache: path.join(staging, "config-cache"),
    cataloguePath: path.join(staging, "cdn-catalogue-setnum.txt"),
    cardsPath: path.join(pack, "cards.json"),
    bundlesDir: path.join(staging, "cdn-bundles"),
    reportPath: path.join(pack, "logs/apk-coverage.json"),
  };
}

function loadCatalogueFile(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) return new Set();
  const out = new Set<string>();
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    out.add(line.toLowerCase());
  }
  return out;
}

function loadScrapedSetnums(
  cardsPath: string,
  bundlesDir: string,
): Set<string> {
  const scraped = new Set<string>();
  if (fs.existsSync(cardsPath)) {
    const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8")) as Record<
      string,
      unknown
    >;
    for (const bid of Object.keys(cards)) {
      const parts = bid.split("_");
      if (parts.length < 3) continue;
      const [setId, , num] = parts;
      if (num && /^\d+$/.test(num)) {
        scraped.add(
          `${setId!.toLowerCase()}_${Number.parseInt(num, 10).toString().padStart(3, "0")}`,
        );
      }
    }
  }
  if (fs.existsSync(bundlesDir) && fs.statSync(bundlesDir).isDirectory()) {
    for (const name of fs.readdirSync(bundlesDir)) {
      if (name.startsWith(".")) continue;
      const parts = name.split("_");
      if (parts.length < 3) continue;
      const setId = parts[0]!;
      const num = parts[2]!.split(".")[0]!;
      if (/^\d+$/.test(num)) {
        scraped.add(
          `${setId.toLowerCase()}_${Number.parseInt(num, 10).toString().padStart(3, "0")}`,
        );
      }
    }
  }
  return scraped;
}

function fmtSetnum(key: SetNumPairKey): string {
  const colon = key.lastIndexOf(":");
  const s = key.slice(0, colon);
  const n = Number.parseInt(key.slice(colon + 1), 10);
  return `${s}_${String(n).padStart(3, "0")}`;
}

function pairParts(key: SetNumPairKey): [string, number] {
  const colon = key.lastIndexOf(":");
  return [key.slice(0, colon), Number.parseInt(key.slice(colon + 1), 10)];
}

export type AuditApkOptions = {
  strictScrape?: boolean;
  writeCatalogue?: boolean;
  paths?: Partial<AuditApkPaths>;
};

export function runAuditApkCoverage(opts: AuditApkOptions = {}): number {
  const paths: AuditApkPaths = {
    ...defaultAuditPaths(opts.paths?.root ?? repoRoot()),
    ...opts.paths,
  };
  const {
    root,
    configCache,
    cataloguePath,
    cardsPath,
    bundlesDir,
    reportPath,
  } = paths;

  if (!fs.existsSync(configCache) || !fs.statSync(configCache).isDirectory()) {
    console.error(`Missing config-cache: ${configCache}`);
    return 1;
  }

  const inv = collectApkSetnumPairs(configCache);
  const apkSetnums = new Set([...inv.pairs].map(fmtSetnum));
  const rebuilt = new Set(catalogueSetnumsFromConfig(configCache));

  if (opts.writeCatalogue) {
    fs.mkdirSync(path.dirname(cataloguePath), { recursive: true });
    fs.writeFileSync(
      cataloguePath,
      `${[...rebuilt].sort().join("\n")}\n`,
      "utf8",
    );
    console.log(
      `Wrote ${path.relative(root, cataloguePath)} (${rebuilt.size} setnums)`,
    );
  }

  const onDisk = loadCatalogueFile(cataloguePath);
  const scraped = loadScrapedSetnums(cardsPath, bundlesDir);

  const missingFromCatalogue = [...apkSetnums]
    .filter((s) => !onDisk.has(s))
    .sort();
  const extraInCatalogue = [...onDisk].filter((s) => !apkSetnums.has(s)).sort();
  const builderDrift = [
    ...[...apkSetnums].filter((s) => !rebuilt.has(s)),
    ...[...rebuilt].filter((s) => !apkSetnums.has(s)),
  ].sort();

  const missingScrape = [...apkSetnums].filter((s) => !scraped.has(s)).sort();
  const orphanScrape = [...scraped].filter((s) => !apkSetnums.has(s)).sort();

  const stemsWithCards = new Set(
    [...inv.pairs].map((k) => k.slice(0, k.lastIndexOf(":"))),
  );
  const compWithoutDb = [...stemsWithCards]
    .filter((s) => !inv.cardDatabaseStems.has(s))
    .sort();
  const dbWithoutComp = [...inv.cardDatabaseStems]
    .filter((s) => !stemsWithCards.has(s))
    .sort();

  const missingByStem = new Map<string, number>();
  for (const s of missingScrape) {
    const stem = s.replace(/_\d+$/, "");
    missingByStem.set(stem, (missingByStem.get(stem) ?? 0) + 1);
  }

  const longformOnly = [...inv.fromLongform].filter(
    (k) => !hasPair(inv.fromCompendium, ...pairParts(k)),
  ).length;
  const compendiumOnly = [...inv.fromCompendium].filter(
    (k) => !hasPair(inv.fromLongform, ...pairParts(k)),
  ).length;

  const report = {
    finishedAt: new Date().toISOString(),
    configCache: path.relative(root, configCache),
    policy: "APK config-cache is the source of truth for printable setnums.",
    apkSetnumCount: apkSetnums.size,
    compendiumPairCount: inv.fromCompendium.size,
    longformPairCount: inv.fromLongform.size,
    longformOnlyCount: longformOnly,
    compendiumOnlyCount: compendiumOnly,
    longformVariants: inv.longformVariants,
    catalogueOnDiskCount: onDisk.size,
    catalogueMissingCount: missingFromCatalogue.length,
    catalogueExtraCount: extraInCatalogue.length,
    catalogueBuilderDriftCount: builderDrift.length,
    catalogueMissingSample: missingFromCatalogue.slice(0, 40),
    scrapedCount: scraped.size,
    scrapeMissingCount: missingScrape.length,
    scrapeMissingByStem: Object.fromEntries(
      [...missingByStem.entries()].sort((a, b) => b[1] - a[1]),
    ),
    scrapeMissingSample: missingScrape.slice(0, 40),
    scrapeOrphanCount: orphanScrape.length,
    scrapeOrphanSample: orphanScrape.slice(0, 20),
    compendiumStemsWithCards: [...stemsWithCards].sort(),
    cardDatabaseStems: [...inv.cardDatabaseStems].sort(),
    stemsInCompendiumWithoutCardDb: compWithoutDb,
    stemsInCardDbWithoutCompendiumCards: dbWithoutComp,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `APK inventory: ${apkSetnums.size} setnums ` +
      `(compendium=${inv.fromCompendium.size}, ` +
      `longForm=${inv.fromLongform.size}, ` +
      `longForm-only=${longformOnly})`,
  );
  console.log(`longForm variants: ${JSON.stringify(inv.longformVariants)}`);
  console.log(
    `Catalogue on disk: ${onDisk.size} — ` +
      `missing=${missingFromCatalogue.length}, extra=${extraInCatalogue.length}, ` +
      `builderDrift=${builderDrift.length}`,
  );
  if (missingFromCatalogue.length) {
    console.log("  Catalogue MISSING (APK not listed):");
    for (const row of missingFromCatalogue.slice(0, 25))
      console.log(`    ${row}`);
    if (missingFromCatalogue.length > 25) {
      console.log(`    … +${missingFromCatalogue.length - 25} more`);
    }
  }
  console.log(
    `Scrape coverage: ${scraped.size}/${apkSetnums.size} ` +
      `(missing=${missingScrape.length}, orphans=${orphanScrape.length})`,
  );
  if (missingScrape.length) {
    console.log("  Top stems still to scrape:");
    for (const [stem, n] of [...missingByStem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)) {
      console.log(`    ${stem}: ${n}`);
    }
  }
  if (compWithoutDb.length) {
    console.log(`  Compendium stems without card-database: ${compWithoutDb}`);
  }
  console.log(`Report: ${path.relative(root, reportPath)}`);

  if (missingFromCatalogue.length || builderDrift.length) {
    console.error(
      "FAIL: catalogue does not cover APK inventory — " +
        "re-run with --write-catalogue or fix collectApkSetnumPairs",
    );
    return 2;
  }
  if (opts.strictScrape && missingScrape.length) {
    console.error("FAIL: --strict-scrape and scrape still missing APK setnums");
    return 2;
  }
  return 0;
}

export function main(argv: string[] = process.argv.slice(2)): number {
  let strictScrape = false;
  let writeCatalogue = false;
  let configCache: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--strict-scrape") strictScrape = true;
    else if (a === "--write-catalogue") writeCatalogue = true;
    else if (a === "--config-cache") configCache = path.resolve(argv[++i]!);
  }
  return runAuditApkCoverage({
    strictScrape,
    writeCatalogue,
    paths: configCache ? { configCache } : undefined,
  });
}

const entry = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === entry) {
  process.exit(main());
}
