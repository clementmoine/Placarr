import { describe, expect, it } from "vitest";

import {
  foldFullsetSetName,
  normalizeFullsetSetRef,
  parseFullsetPokemonSetsHtml,
} from "./parseFullsetSets";

const FIXTURE = `
<div class="set-card"
    data-set-id="318"
    data-set-type="1"
    data-set-date="2025-07-18"
    data-set-name="Foudre Noire"
    data-set-name-en="Black Bolt"
    data-set-ref="BLK"
    data-set-ref-en="BLK">
  <a href="/pokemon/sets/318/foudre-noire-blk">
    <img src="/assets/media/pokemon/sets/icons/icon_black-bolt.webp" alt="BLK">
    <img src="/assets/media/pokemon/sets/image_foudre-noire.webp" alt="Foudre Noire">
  </a>
</div>
<div class="set-card"
    data-set-id="312"
    data-set-type="18"
    data-set-date="2024-12-04"
    data-set-name="Collection McDonald&#039;s 2024"
    data-set-name-en="McDonald&#039;s Dragon Discovery 2024"
    data-set-ref="M24"
    data-set-ref-en="M24">
  <a href="/pokemon/sets/312/collection-mcdonalds-2024-m24">
    <img src="/assets/media/pokemon/sets/icons/icon_mcdonald-s-dragon-discovery-2024.webp" alt="M24">
  </a>
</div>
<!-- duplicate id should collapse -->
<div class="set-card"
    data-set-id="318"
    data-set-name="Foudre Noire"
    data-set-name-en="Black Bolt"
    data-set-ref="BLK"></div>
`;

describe("parseFullsetPokemonSetsHtml", () => {
  it("reads FR/EN names, refs, dates and asset paths", () => {
    const rows = parseFullsetPokemonSetsHtml(FIXTURE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      fullsetId: "318",
      nameFr: "Foudre Noire",
      nameEn: "Black Bolt",
      ref: "BLK",
      releasedAt: "2025-07-18",
      path: "/pokemon/sets/318/foudre-noire-blk",
      iconPath: "/assets/media/pokemon/sets/icons/icon_black-bolt.webp",
      imagePath: "/assets/media/pokemon/sets/image_foudre-noire.webp",
    });
    expect(rows[1]).toMatchObject({
      fullsetId: "312",
      nameFr: "Collection McDonald's 2024",
      nameEn: "McDonald's Dragon Discovery 2024",
      ref: "M24",
    });
  });
});

describe("foldFullsetSetName", () => {
  it("ignores diacritics and punctuation for EN matching", () => {
    expect(foldFullsetSetName("Sword & Shield")).toBe(
      foldFullsetSetName("Sword and Shield"),
    );
    expect(foldFullsetSetName("Épée et Bouclier")).toBe("epee et bouclier");
  });
});

describe("normalizeFullsetSetRef", () => {
  it("uppercases and strips junk", () => {
    expect(normalizeFullsetSetRef(" blk ")).toBe("BLK");
    expect(normalizeFullsetSetRef("")).toBeNull();
  });
});
