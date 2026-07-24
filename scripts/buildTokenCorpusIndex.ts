#!/usr/bin/env tsx
/**
 * Prebuild title-token DF index from RawName (+ optional Item / BarcodeCache names).
 * Resolve path never scans Prisma — run this offline / on a cron.
 *
 *   pnpm title-idf:build-index
 *   TOKEN_CORPUS_INDEX_PATH=/path/to/token-df.json pnpm title-idf:build-index
 */
import { prisma } from "@/lib/db/prisma";
import {
  buildTokenCorpusIndexFromTitles,
  writeTokenCorpusIndex,
} from "@/core/enrich/titles/tokenCorpusIndex";

async function collectTitles(): Promise<string[]> {
  const titles = new Set<string>();

  const rawNames = await prisma.rawName.findMany({
    select: { value: true },
  });
  for (const row of rawNames) {
    const value = row.value?.trim();
    if (value) titles.add(value);
  }

  const items = await prisma.item.findMany({
    select: { name: true },
  });
  for (const row of items) {
    const value = row.name?.trim();
    if (value) titles.add(value);
  }

  const caches = await prisma.barcodeCache.findMany({
    select: { cleanName: true, displayName: true },
  });
  for (const row of caches) {
    const clean = row.cleanName?.trim();
    const display = row.displayName?.trim();
    if (clean) titles.add(clean);
    if (display) titles.add(display);
  }

  return Array.from(titles);
}

async function main() {
  const titles = await collectTitles();
  const stats = buildTokenCorpusIndexFromTitles(titles);
  const filePath = await writeTokenCorpusIndex(stats);

  const top = Array.from(stats.documentFrequency.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([token, df]) => `${token}:${df}`)
    .join(", ");

  console.log(
    `Title IDF index ready (${stats.docCount} docs, ${stats.documentFrequency.size} tokens) → ${filePath}`,
  );
  if (top) console.log(`Top DF: ${top}`);
  if (stats.docCount === 0) {
    console.warn(
      "Corpus empty — resolve will keep using in-memory batch stats until RawNames exist.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
