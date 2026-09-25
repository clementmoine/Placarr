/**
 * Assets curés du pack `dragonball/cg` : verso et plaque de foil.
 *
 * Le fichier lui-même est commun à tous les packs de cartes — il ne différait
 * ici que par l'id et le nom des fonctions, à une ligne près entre les deux
 * jumeaux Dragon Ball. Ce module ne garde donc que ce qui est propre au pack :
 * où vit son dossier curé.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureCuratedPackAssets,
  installFullFoilMask,
  type CuratedAssetsOptions,
} from "@/providers/shared/cardCatalogue/curatedAssets";
import { installProviderProductsContents } from "@/providers/shared/sealedProducts/curatedContents";

import { DBS_CG_PACK_ID } from "../indexStore";

const PROVIDER_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function dbsCgCuratedDir(): string {
  return path.join(PROVIDER_DIR, "curated");
}

export function installDbsCgFullFoilMask(
  opts: CuratedAssetsOptions = {},
): Promise<{ installed: boolean; dest: string }> {
  return installFullFoilMask(DBS_CG_PACK_ID, opts);
}

export function ensureDbsCgCuratedAssets(
  opts?: CuratedAssetsOptions,
): Promise<void> {
  installProviderProductsContents(
    DBS_CG_PACK_ID,
    path.join(dbsCgCuratedDir(), "products-contents.json"),
  );
  return ensureCuratedPackAssets({
    packId: DBS_CG_PACK_ID,
    curatedDir: dbsCgCuratedDir(),
    options: opts,
  });
}
