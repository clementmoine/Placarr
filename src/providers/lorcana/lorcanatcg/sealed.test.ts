/**
 * Regression: Illumineer's Quest structures attestées (Ravensburger / Mushu wiki).
 * Palace Heist = 50 scénario + 2×60 = 170 ; Hunny Rescue = 50+10+120+6+4 = 190.
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

describe("lorcana sealed products-contents (quest structures)", () => {
  it.each([
    ["coffret-quete-des-illumineurs-vol-au-palais", 170],
    ["palace-heist-quest-en", 170],
    ["reign-of-jafar-quest", 170],
    ["coffret-quete-des-illumineurs-equipe-miel-a-la-rescousse", 190],
    ["great-hunny-rescue-quest-en", 190],
    ["attack-of-the-vine-quest", 190],
  ] as const)("%s — %i cartes déclarées", (slug, declared) => {
    const sku = load().skus[slug];
    expect(sku?.declaredCardCount).toBe(declared);
    expect(sku?.randomPoolScope).toBe("none");
    // Listes carte-par-carte non publiées : structure seulement, pas de faux « known ».
    expect(sku?.contentsKnown).toBe(false);
  });
});
