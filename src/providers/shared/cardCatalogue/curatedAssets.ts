/**
 * Poser les assets curés d'un pack : le verso, et la plaque de foil pleine face.
 *
 * Écrit deux fois à l'identique — les deux packs Dragon Ball ne différaient que
 * par l'id du pack et le nom des fonctions, à **une ligne près**. Rien là-dedans ne
 * relève du jeu : un verso se copie, une plaque blanche se génère, et les deux
 * savent déjà ne rien refaire quand c'est en place.
 *
 * Le pack fournit son id et son dossier curé ; ce module fait le reste.
 */
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { packCardsDir } from "@/lib/packPaths";
import { foilPackDir } from "@/lib/runtimeData";
import {
  curatedCardsDir,
  installCuratedCardBacks,
} from "@/providers/shared/curatedCardsInstall";

export type CuratedAssetsOptions = {
  dryRun?: boolean;
  force?: boolean;
};

/**
 * Une plaque blanche de 64×64, sans perte.
 *
 * Ce n'est pas un masque mesuré : c'est le dire « tout brille » pour un pack
 * dont on n'a jamais capté le foil carte par carte. Le rendu s'appuie dessus
 * plutôt que sur rien, et une capture réelle le remplacera sans que rien
 * d'autre bouge.
 */
export async function installFullFoilMask(
  packId: string,
  opts: CuratedAssetsOptions = {},
): Promise<{ installed: boolean; dest: string }> {
  const dest = path.join(foilPackDir(packId), "full_foil_mask.webp");
  if (!opts.force && existsSync(dest)) return { installed: false, dest };
  if (opts.dryRun) return { installed: true, dest };
  mkdirSync(path.dirname(dest), { recursive: true });
  /*
    `sharp` est chargé à la demande : il embarque un binaire natif, et ce module
    est importé par des chemins qui n'installent jamais rien.
  */
  const { default: sharp } = await import("sharp");
  await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#ffffff" },
  })
    .webp({ lossless: true })
    .toFile(dest);
  return { installed: true, dest };
}

export async function ensureCuratedPackAssets(input: {
  packId: string;
  /** Racine `curated/` du provider — lui seul sait où elle est. */
  curatedDir: string;
  options?: CuratedAssetsOptions;
  onProgress?: (message: string) => void;
}): Promise<void> {
  const opts = input.options ?? {};
  const report =
    input.onProgress ?? ((message: string) => console.log(message));
  const suffix = opts.dryRun ? " (dry run)" : "";

  const backs = await installCuratedCardBacks({
    curatedCardsDir: curatedCardsDir(input.curatedDir),
    destCardsDir: packCardsDir(input.packId),
    dryRun: opts.dryRun,
    force: opts.force,
  });
  for (const back of backs) {
    if (!back.installed) continue;
    report(`   pack back → ${back.dest}${suffix}`);
  }

  const mask = await installFullFoilMask(input.packId, opts);
  if (mask.installed) {
    report(`   full foil mask → ${mask.dest}${suffix}`);
  }
}
