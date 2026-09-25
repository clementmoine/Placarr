/**
 * One-shot: promote leftover pack-root JSON into catalog.sqlite.
 *
 * - products-index.json → products / product_contents
 * - locale-specific-faces.json → locale_specific_faces
 * - Carddass appearances.json / facts-ja.json → pack_documents
 *
 * Does not touch staging/ and does not delete JSON (read fallback remains).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { packCatalogDb, packProductsIndexPath } from "@/lib/packPaths";
import {
  isProductsIndexV1,
  type ProductsIndexV1,
} from "@/providers/shared/sealedProducts/indexFormat";
import { persistSealedProductsIndex } from "@/providers/shared/sealedProducts/persistProductsIndex";
import {
  loadProductsIndexFromSqlite,
  readPackDocument,
  writeLocaleSpecificFacesToSqlite,
  writePackDocument,
} from "@/providers/shared/sealedProducts/productsSqlite";
import {
  loadNarutoAppearancesFile,
  NARUTO_PACK_ID,
  writeNarutoAppearancesFile,
  type NarutoAppearancesFile,
} from "@/providers/naruto/narutocarddass/identity";
import {
  loadNarutoJaFacts,
  type NarutoJaFactsFile,
} from "@/providers/naruto/narutocarddass/scrape/catalogues";

function listPackIdsWithProductsIndex(): string[] {
  const root = dataRoot();
  const out: string[] = [];
  const walk = (rel: string, depth: number) => {
    if (depth > 3) return;
    const dir = path.join(root, rel);
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || name === "staging" || name === "logs") continue;
      const abs = path.join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      const packRel = rel ? `${rel}/${name}` : name;
      if (existsSync(path.join(abs, "products-index.json"))) out.push(packRel);
      walk(packRel, depth + 1);
    }
  };
  walk("", 0);
  return out.sort();
}

function migrateProducts(packId: string): string {
  const already = loadProductsIndexFromSqlite(packId);
  if (already && Object.keys(already.products).length > 0) {
    return `skip products (sqlite has ${Object.keys(already.products).length})`;
  }
  const file = packProductsIndexPath(packId);
  if (!existsSync(file)) return "skip products (no JSON)";
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isProductsIndexV1(raw)) return "skip products (invalid JSON)";
  const index = raw as ProductsIndexV1;
  const n = Object.keys(index.products).length;
  if (!n) return "skip products (empty JSON)";
  persistSealedProductsIndex(packId, index.products, { alreadyMerged: true });
  return `ok products → sqlite (${n})`;
}

function migrateLocaleFaces(packId: string): string {
  const facesPath = path.join(
    path.dirname(packCatalogDb(packId)),
    "locale-specific-faces.json",
  );
  if (!existsSync(facesPath)) return "skip locale-faces (no JSON)";
  try {
    const raw = JSON.parse(readFileSync(facesPath, "utf8")) as {
      faces?: { set: string; card: string }[];
    };
    const faces = raw.faces ?? [];
    if (!faces.length) return "skip locale-faces (empty)";
    writeLocaleSpecificFacesToSqlite(packId, faces);
    return `ok locale-faces → sqlite (${faces.length})`;
  } catch (e) {
    return `fail locale-faces: ${e}`;
  }
}

function migrateCarddassDocs(): string[] {
  const packRoot = path.join(dataRoot(), NARUTO_PACK_ID);
  const dbPath = path.join(packRoot, "catalog.sqlite");
  const lines: string[] = [];

  const apps = loadNarutoAppearancesFile(packRoot);
  const appsInDb = readPackDocument<NarutoAppearancesFile>(
    NARUTO_PACK_ID,
    "appearances",
    { dbPath },
  );
  if (apps?.appearances && !appsInDb?.appearances) {
    writeNarutoAppearancesFile(packRoot, apps);
    lines.push(
      `ok appearances → pack_documents (${Object.keys(apps.appearances).length})`,
    );
  } else if (appsInDb?.appearances) {
    lines.push("skip appearances (already in sqlite)");
  } else {
    lines.push("skip appearances (nothing to migrate)");
  }

  const facts = loadNarutoJaFacts(packRoot);
  const factsInDb = readPackDocument<NarutoJaFactsFile>(NARUTO_PACK_ID, "facts-ja", {
    dbPath,
  });
  if (facts?.cards && !factsInDb?.cards) {
    writePackDocument(NARUTO_PACK_ID, "facts-ja", facts, { dbPath });
    lines.push(`ok facts-ja → pack_documents (${facts.count})`);
  } else if (factsInDb?.cards) {
    lines.push("skip facts-ja (already in sqlite)");
  } else {
    lines.push("skip facts-ja (nothing to migrate)");
  }

  return lines;
}

function main(): void {
  const packs = listPackIdsWithProductsIndex();
  console.log(`packs with products-index.json: ${packs.length}`);
  for (const packId of packs) {
    console.log(`[${packId}] ${migrateProducts(packId)}`);
    console.log(`[${packId}] ${migrateLocaleFaces(packId)}`);
  }
  for (const line of migrateCarddassDocs()) {
    console.log(`[${NARUTO_PACK_ID}] ${line}`);
  }
}

main();
