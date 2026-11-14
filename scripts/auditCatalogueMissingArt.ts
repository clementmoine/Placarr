/**
 * Export print_keys still missing a local `art.*` face (admin « sans image »).
 *
 * Usage:
 *   pnpm tsx scripts/auditCatalogueMissingArt.ts
 *   pnpm tsx scripts/auditCatalogueMissingArt.ts <CataloguePackId…>
 *
 * No args → every registered catalogue pack (ids come from the registry, not
 * a hardcoded list — keeps the blindness guards green).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  listCatalogueCards,
  resetCatalogueCardsCache,
} from "@/lib/admin/catalogueCards";
import {
  CATALOGUE_PACK_IDS,
  cataloguePackInfo,
  type CataloguePackId,
  isCataloguePackId,
} from "@/lib/admin/cataloguePacks";

function preferLangForPack(pack: CataloguePackId): string {
  const info = cataloguePackInfo(pack);
  return (
    info?.catalogueLocales?.[0] ??
    info?.browseLocales?.[0] ??
    "fr"
  );
}

async function auditPack(pack: CataloguePackId): Promise<{
  pack: CataloguePackId;
  total: number;
  missing: number;
  sample: string[];
}> {
  resetCatalogueCardsCache();
  const page = await listCatalogueCards({
    pack,
    preferLang: preferLangForPack(pack),
    locales: "preferred",
    missingArtOnly: true,
    limit: 500,
    offset: 0,
  });
  const faces = page.cards.filter((row) => row.kind === "face");
  return {
    pack,
    total: page.total,
    missing: page.total,
    sample: faces
      .slice(0, 40)
      .map(
        (row) => `${row.printKey}\t${row.lang}\t${row.set}\t${row.card}`,
      ),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const packs = (
    argv.length
      ? argv.filter(isCataloguePackId)
      : [...CATALOGUE_PACK_IDS]
  ) as CataloguePackId[];

  const outDir = path.join(process.cwd(), "logs", "catalogue-missing-art");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary: Array<{ pack: string; missing: number }> = [];

  for (const pack of packs) {
    try {
      const result = await auditPack(pack);
      summary.push({ pack, missing: result.missing });
      const safe = pack.replace(/\//g, "__");
      writeFileSync(
        path.join(outDir, `${stamp}-${safe}.tsv`),
        ["printKey\tlang\tset\tcard", ...result.sample].join("\n") + "\n",
      );
      console.log(
        `${pack}: ${result.missing} sans image (sample ${result.sample.length})`,
      );
    } catch (err) {
      console.error(
        `${pack}: échec — ${err instanceof Error ? err.message : err}`,
      );
      summary.push({ pack, missing: -1 });
    }
  }

  writeFileSync(
    path.join(outDir, `${stamp}-summary.json`),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), summary },
      null,
      2,
    ) + "\n",
  );
  console.log(`→ ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
