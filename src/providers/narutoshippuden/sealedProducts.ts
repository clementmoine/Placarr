/**
 * Les produits scellés du 疾風伝 : dix-neuf SKU, et son propre index.
 *
 * Ils s'écrivaient dans l'index du pack Carddass jusqu'au 2026-08-21 — un autre
 * jeu, un autre catalogue. Leur relevé et leurs visuels de staging sont partis
 * avec eux ; il ne restait qu'à leur donner un index à eux.
 *
 * L'ingest lui-même reste chez le Carddass et se laisse appeler : les deux jeux
 * Naruto partagent la disposition du staging, et le jeu tient tout entier dans
 * les specs qu'on lui passe.
 */
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";

import { NARUTO_SHIPPUDEN_PACK_ID } from "./indexStore";
import { shippudenSealedReleases } from "./sealedReleases";

export async function ingestNarutoShippudenSealedProducts(opts?: {
  packRoot?: string;
}): Promise<{ pack: string; written: number; skipped: number; file: string }> {
  const { ingestSealedLine } = await import(
    /* webpackIgnore: true */
    "@/providers/narutocarddass/sealedProducts"
  );
  return ingestSealedLine({
    packId: NARUTO_SHIPPUDEN_PACK_ID,
    packRoot:
      opts?.packRoot ??
      path.join(dataRoot(), ...NARUTO_SHIPPUDEN_PACK_ID.split("/")),
    /*
      `declaredCardCount` : ce que l'emballage annonce. Le relevé ne le porte
      pour aucun de ces dix-neuf SKU — seul le sachet du 第一幕 imprime un
      compte (全69種+1種), et il n'est pas dans la base produit. Explicitement
      nul plutôt qu'absent : rien à déclarer se dit, ne se devine pas.
    */
    specs: shippudenSealedReleases().map((spec) => ({
      ...spec,
      declaredCardCount: null,
    })),
  });
}
