/**
 * Assets curés du pack `dbs/cg` : verso et plaque de foil.
 *
 * Le travail lui-même est commun à tous les packs de cartes — il ne différait
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

import { DBS_CG_PACK_ID } from "./indexStore";

const PROVIDER_DIR = path.dirname(fileURLToPath(import.meta.url));

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
  return ensureCuratedPackAssets({
    packId: DBS_CG_PACK_ID,
    curatedDir: dbsCgCuratedDir(),
    options: opts,
  });
}
