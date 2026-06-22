import { PrismaClient } from "@prisma/client";

import { fetchFromLaunchBox } from "@/services/providers/launchbox/resolver";
import { metadataTitleSimilarity } from "@/lib/metadataTitleSimilarity";

const prisma = new PrismaClient();

type AuditRow = {
  name: string;
  shelf: string;
  slug: string | null;
  found: boolean;
  launchboxTitle?: string;
  launchboxId?: string;
  similarity?: number;
};

async function main() {
  const items = await prisma.item.findMany({
    where: { shelf: { type: "games" } },
    select: {
      name: true,
      slug: true,
      shelf: { select: { name: true } },
      metadata: { select: { title: true } },
    },
    orderBy: [{ shelf: { name: "asc" } }, { name: "asc" }],
  });

  const results: AuditRow[] = [];

  for (const item of items) {
    const lookupName = item.metadata?.title?.trim() || item.name;
    const platform = item.shelf.name;
    const match = await fetchFromLaunchBox(lookupName, platform);

    if (!match) {
      results.push({
        name: item.name,
        shelf: platform,
        slug: item.slug,
        found: false,
      });
      continue;
    }

    const similarity = metadataTitleSimilarity(lookupName, match.title ?? "");
    results.push({
      name: item.name,
      shelf: platform,
      slug: item.slug,
      found: true,
      launchboxTitle: match.title,
      launchboxId: match.externalIds?.launchbox ?? undefined,
      similarity,
    });
  }

  const found = results.filter((row) => row.found);
  const missing = results.filter((row) => !row.found);
  const suspicious = found.filter(
    (row) => (row.similarity ?? 0) < 0.72 && row.launchboxTitle !== row.name,
  );

  console.log(`\n=== LaunchBox audit (${items.length} games) ===\n`);
  console.log(`Found: ${found.length}/${items.length} (${Math.round((found.length / items.length) * 100)}%)`);
  console.log(`Missing: ${missing.length}`);
  console.log(`Found but low similarity (<0.72): ${suspicious.length}`);

  const byShelf = new Map<string, { found: number; total: number }>();
  for (const row of results) {
    const entry = byShelf.get(row.shelf) ?? { found: 0, total: 0 };
    entry.total += 1;
    if (row.found) entry.found += 1;
    byShelf.set(row.shelf, entry);
  }

  console.log("\n--- By shelf ---");
  for (const [shelf, stats] of [...byShelf.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    console.log(
      `${shelf}: ${stats.found}/${stats.total} (${Math.round((stats.found / stats.total) * 100)}%)`,
    );
  }

  if (missing.length > 0) {
    console.log("\n--- Not found ---");
    for (const row of missing) {
      console.log(`  [${row.shelf}] ${row.name}`);
    }
  }

  if (suspicious.length > 0) {
    console.log("\n--- Found but questionable match ---");
    for (const row of suspicious) {
      console.log(
        `  [${row.shelf}] ${row.name} -> "${row.launchboxTitle}" (sim=${row.similarity?.toFixed(2)}, id=${row.launchboxId})`,
      );
    }
  }

  console.log("\n--- All matches ---");
  for (const row of found) {
    const flag =
      row.launchboxTitle !== row.name ? ` != "${row.launchboxTitle}"` : "";
    console.log(`  [${row.shelf}] ${row.name}${flag}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
