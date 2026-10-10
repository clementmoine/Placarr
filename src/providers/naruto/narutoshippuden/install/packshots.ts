/**
 * Remoissonne les packshots Bandai du 疾風伝 sous `staging/carddass-official/`.
 *
 * Les specs (`shippudenSealedReleases`) sont l'autorité pour JAN → fichier ;
 * le relevé `carddass-official-products.json` fournit les URLs Akamai.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { dataRoot } from "@/lib/runtimeData";
import { harvestBandaiPackshots } from "@/providers/naruto/shared/bandaiPackshots";

import official from "../curated/sources/carddass-official-products.json";
import { NARUTO_SHIPPUDEN_PACK_ID } from "../indexStore";
import { shippudenSealedReleases } from "../sealed";

const DELAY_MS = 1200;

export function shippudenOfficialFilesByJan(): Map<string, string> {
  const out = new Map<string, string>();
  for (const spec of shippudenSealedReleases()) {
    if (spec.stagingKind !== "carddass-official" || !spec.jan) continue;
    out.set(spec.jan, spec.stagingFile);
  }
  return out;
}

export async function harvestShippudenOfficialPackshots(opts: {
  packRoot?: string;
  force?: boolean;
} = {}): Promise<{ folder: string; written: number; failed: number }> {
  const packRoot =
    opts.packRoot ??
    path.join(dataRoot(), ...NARUTO_SHIPPUDEN_PACK_ID.split("/"));
  const destDir = path.join(packRoot, "staging", "carddass-official");
  mkdirSync(destDir, { recursive: true });
  const result = await harvestBandaiPackshots({
    rows: official.products,
    fileByJan: shippudenOfficialFilesByJan(),
    destDir,
    force: opts.force,
    delayMs: DELAY_MS,
  });
  return { folder: "carddass-official", ...result };
}
