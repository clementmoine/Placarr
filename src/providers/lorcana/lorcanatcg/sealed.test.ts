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
    ["coffret-quete-des-illumineurs-menace-des-profondeurs", 170],
  ] as const)("%s — %i cartes déclarées", (slug, declared) => {
    const sku = load().skus[slug];
    expect(sku?.declaredCardCount).toBe(declared);
    expect(sku?.randomPoolScope).toBe("none");
    // Listes carte-par-carte non publiées : structure seulement, pas de faux « known ».
    expect(sku?.contentsKnown).toBe(false);
    expect(sku?.structureUnits?.length).toBeGreaterThan(0);
  });

  it("Hunny Rescue / Vine breaks down into scenario + tendrils + decks + encounters + prizes", () => {
    expect(load().skus["great-hunny-rescue-quest-en"]?.structureUnits).toEqual([
      { label: "Scenario deck (Vine)", count: 1, cardsEach: 50 },
      { label: "Vine Tendril", count: 10, cardsEach: 1 },
      { label: "Ready-to-play decks", count: 2, cardsEach: 60 },
      { label: "Encounter cards", count: 6, cardsEach: 1 },
      { label: "Prize packs", count: 2, cardsEach: 2 },
    ]);
  });

  it("Palace Heist is 1×50 scenario + 2×60 decks", () => {
    expect(load().skus["palace-heist-quest-en"]?.structureUnits).toEqual([
      { label: "Scenario deck (Jafar)", count: 1, cardsEach: 50 },
      { label: "Ready-to-play decks", count: 2, cardsEach: 60 },
    ]);
  });
});

describe("lorcana sealed products-contents (starter / gateway)", () => {
  it.each([
    ["coffret-de-demarrage-2-joueurs-set-12-contrees-inconnues", 120],
    ["coffret-prelude-pour-apprendre-a-jouer", 132],
    ["wilds-unknown-collector_box-en", 120],
    ["2-player-starter-set-collector_box-en", 120],
  ] as const)("%s — %i cartes déclarées", (slug, declared) => {
    const sku = load().skus[slug];
    expect(sku?.declaredCardCount).toBe(declared);
    expect(sku?.randomPoolScope).toBe("none");
    expect(sku?.contentsKnown).toBe(false);
    expect(sku?.packsContained).toBeNull();
    expect(sku?.structureUnits?.length).toBeGreaterThan(0);
  });

  it("Gateway breaks down into decks + reward packs", () => {
    expect(load().skus["coffret-prelude-pour-apprendre-a-jouer"]?.structureUnits).toEqual([
      { label: "Starting decks", count: 2, cardsEach: 30 },
      { label: "Reward packs", count: 4, cardsEach: 18 },
    ]);
  });

  it("2-player starter is 2×60 ready-to-play decks (FR + set-page EN alias)", () => {
    const units = [
      { label: "Ready-to-play decks", count: 2, cardsEach: 60 },
    ];
    expect(
      load().skus["coffret-de-demarrage-2-joueurs-set-12-contrees-inconnues"]
        ?.structureUnits,
    ).toEqual(units);
    expect(load().skus["wilds-unknown-collector_box-en"]?.structureUnits).toEqual(
      units,
    );
  });
});
