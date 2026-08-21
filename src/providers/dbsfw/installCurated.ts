/**
 * Assets curés du pack `dbs/fw` : verso et plaque de foil. *
 * Le verso est celui des Masters, faute d'avoir vérifié le verso physique
 * de Fusion World — un placeholder assumé, pas une mesure.
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

import { DBS_FW_PACK_ID } from "./indexStore";

const PROVIDER_DIR = path.dirname(fileURLToPath(import.meta.url));

export function dbsFwCuratedDir(): string {
  return path.join(PROVIDER_DIR, "curated");
}

export function installDbsFwFullFoilMask(
  opts: CuratedAssetsOptions = {},
): Promise<{ installed: boolean; dest: string }> {
  return installFullFoilMask(DBS_FW_PACK_ID, opts);
}

export function ensureDbsFwCuratedAssets(
  opts?: CuratedAssetsOptions,
): Promise<void> {
  return ensureCuratedPackAssets({
    packId: DBS_FW_PACK_ID,
    curatedDir: dbsFwCuratedDir(),
    options: opts,
  });
}
