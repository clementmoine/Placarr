/**
 * Rebuild curated sealed-contents ledgers from TCG-Cards staging + catalogue join.
 *
 * `pnpm exec tsx src/providers/shared/sealedProducts/rebuildFromStaging.ts`
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { packDataDir } from "@/lib/packPaths";
import { providerModuleForPack } from "@/providers/shared/packOwner";
import { loadDbscardsCatalogIndex } from "@/providers/shared/dbscards/catalogIndex";
import { completeProductContainsPrints } from "@/providers/shared/dbscards/completePrints";
import type { DbscardsProductPage } from "@/providers/shared/dbscards/parseProducts";
import {
  ingestSealedProducts,
  printGameForPack,
  printKeyFromCollectorRef,
} from "@/providers/shared/sealedProducts/ingest";

type Sku = {
  source: string;
  verifiedAt: string;
  notes?: string;
  behavior: "known_bundle";
  randomPoolScope: "none";
  contentsKnown: boolean;
  containsPrintsIsPreview: boolean;
  declaredCardCount: number | null;
  guaranteedPrintKeys: string[];
};

function findProductsJson(packId: string): string | null {
  const staging = path.join(packDataDir(packId), "staging");
  if (!existsSync(staging)) return null;
  for (const name of readdirSync(staging)) {
    const p = path.join(staging, name, "products.json");
    if (existsSync(p)) return p;
  }
  return null;
}

function isDeckish(page: DbscardsProductPage): boolean {
  const role = String(page.category || "").toLowerCase();
  const slug = page.slug.toLowerCase();
  if (
    role.includes("deck") ||
    role.includes("starter") ||
    role.includes("coffret") ||
    role.includes("special") ||
    role.includes("ultimate") ||
    role.includes("gift") ||
    role.includes("collection")
  ) {
    return true;
  }
  if (slug.includes("starter") || /^(sd|fs|st|be|ex)\d/.test(slug)) {
    return true;
  }
  const declared = page.declaredCardCount;
  return Boolean(
    page.containsPrints?.length &&
      declared != null &&
      declared > 0 &&
      declared < 100,
  );
}

function providerCuratedDir(packId: string): string | null {
  const mod = providerModuleForPack(packId);
  if (!mod) return null;
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    mod.info.id,
    "curated",
  );
}

function rebuildPack(
  packId: string,
  byKind: Record<string, unknown>,
  lang: string,
): void {
  const productsPath = findProductsJson(packId);
  if (!productsPath) {
    console.log(packId, "no staging products.json");
    return;
  }
  const raw = JSON.parse(readFileSync(productsPath, "utf8")) as
    | DbscardsProductPage[]
    | { products?: DbscardsProductPage[] };
  const items: DbscardsProductPage[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.products)
      ? raw.products
      : [];
  const catalog = loadDbscardsCatalogIndex({
    dbPath: path.join(packDataDir(packId), "catalog.sqlite"),
    lang,
  });
  const game = printGameForPack(packId);
  const skus: Record<string, Sku> = {};
  let known = 0;
  let partial = 0;

  for (const page of items) {
    if (!page?.slug || !isDeckish(page)) continue;
    const completed = completeProductContainsPrints(page, catalog);
    const links = completed.containsPrints || [];
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      if (!game) break;
      const pk = printKeyFromCollectorRef(game, link.ref);
      if (!pk || seen.has(pk)) continue;
      seen.add(pk);
      keys.push(pk);
    }
    if (!keys.length) continue;

    const declared = completed.declaredCardCount ?? page.declaredCardCount ?? null;
    const preview = Boolean(completed.containsPrintsIsPreview);
    const nearComplete =
      declared != null &&
      declared > 0 &&
      keys.length >= Math.max(1, declared - 1) &&
      keys.length >= Math.ceil(declared * 0.9);
    const contentsKnown = (!preview && keys.length > 0) || nearComplete;
    if (contentsKnown) known += 1;
    else partial += 1;

    skus[page.slug] = {
      source: `staging ${path.basename(path.dirname(productsPath))} + catalog join`,
      verifiedAt: "2026-09-13",
      notes: contentsKnown
        ? `${keys.length} printKeys${declared != null ? ` / declared ${declared}` : ""}.`
        : `Liste partielle ${keys.length}${declared != null ? `/${declared}` : ""} — preview boutique.`,
      behavior: "known_bundle",
      randomPoolScope: "none",
      contentsKnown,
      containsPrintsIsPreview: !contentsKnown,
      declaredCardCount: declared,
      guaranteedPrintKeys: keys,
    };
  }

  const out = {
    version: 1 as const,
    pack: packId,
    updatedAt: "2026-09-13",
    byKind,
    skus,
  };
  const json = `${JSON.stringify(out, null, 2)}\n`;

  const curatedProvider = providerCuratedDir(packId);
  if (curatedProvider) {
    mkdirSync(curatedProvider, { recursive: true });
    writeFileSync(path.join(curatedProvider, "products-contents.json"), json);
  }

  const dataCurated = path.join(packDataDir(packId), "curated");
  mkdirSync(dataCurated, { recursive: true });
  writeFileSync(path.join(dataCurated, "products-contents.json"), json);
  writeFileSync(path.join(dataCurated, "sealed-contents.json"), json);

  console.log(
    packId,
    "skus",
    Object.keys(skus).length,
    "known",
    known,
    "partial",
    partial,
  );
}

async function main() {
  const display24 = {
    source: "Bandai retail display (standard 24)",
    verifiedAt: "2026-08-26",
    packsContained: 24,
    randomPoolScope: "none" as const,
  };
  const boosterSet = {
    source: "Bandai booster — pool = set catalogue",
    verifiedAt: "2026-09-13",
    packsContained: 1,
    randomPoolScope: "set" as const,
  };

  rebuildPack("dbs/cg", { display: display24, booster: boosterSet }, "fr");
  rebuildPack("dbs/fw", { display: display24, booster: boosterSet }, "en");
  rebuildPack(
    "onepiece",
    { display: display24, booster: boosterSet },
    "fr",
  );

  for (const pack of ["dbs/cg", "dbs/fw", "onepiece"] as const) {
    const r = await ingestSealedProducts(pack);
    console.log("ingest", r);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
