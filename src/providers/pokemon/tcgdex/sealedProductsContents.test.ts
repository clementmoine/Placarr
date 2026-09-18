/**
 * Regression: ETB booster counts per era (Poképédia « Nombre de boosters »).
 * SM/SWSH standard = 8, sets spéciaux = 10, SV/Méga-Évolution = 9.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { CuratedSealedContentsFile } from "@/providers/shared/sealedProducts/curatedContents";

const curated = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "curated",
  "products-contents.json",
);

function load(): CuratedSealedContentsFile {
  return JSON.parse(readFileSync(curated, "utf8")) as CuratedSealedContentsFile;
}

describe("pokemon sealed products-contents (ETB per era)", () => {
  it.each([
    // SV / Méga-Évolution — 9 boosters
    ["coffret-dresseur-elite-sv01-ecarlate-et-violet-koraidon", 9],
    ["coffret-dresseur-elite-fable-nebuleuse-felicanis-fortusimia-favianos", 9],
    ["coffret-dresseur-elite-mega-evolution-lucario", 9],
    ["coffret-dresseur-elite-mega-evolution-chaos-ascendant", 9],
    // SM / SWSH standard — 8 boosters
    ["coffret-dresseur-elite-epee-et-bouclier-zacian", 8],
    ["coffret-dresseur-elite-eclipse-cosmique", 8],
    ["coffret-dresseur-elite-tempete-argentee", 8],
    // Sets spéciaux — 10 boosters
    ["coffret-dresseur-elite-celebrations", 10],
    ["coffret-dresseur-elite-destinees-radieuses-evoli", 10],
    ["coffret-dresseur-elite-crz-zenith-supreme-lucario", 10],
    ["coffret-dresseur-elite-pokemon-go-mewtwo", 10],
  ] as const)("%s — %i boosters", (slug, packs) => {
    const sku = load().skus[slug];
    expect(sku?.packsContained).toBe(packs);
    expect(sku?.randomPoolScope).toBe("none");
    expect(sku?.contentsKnown).toBe(false);
  });
});
