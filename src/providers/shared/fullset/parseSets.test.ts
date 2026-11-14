import { describe, expect, it } from "vitest";

import {
  foldFullsetSetName,
  normalizeFullsetSetRef,
  parseFullsetSetsHtml,
} from "./parseSets";

const YGO_FIXTURE = `
<div class="set-card"
    data-set-id="667"
    data-set-type="1"
    data-set-date="2025-10-23"
    data-set-name="Le Labyrinthe des Morts"
    data-set-name-en="Maze of Muertos"
    data-set-ref="MZMU"
    data-set-ref-en="MZMU">
  <a href="/yugioh/sets/667/le-labyrinthe-des-morts-mzmu">
    <img src="/assets/media/yugioh/sets/icons/icon_maze-of-muertos.webp" alt="MZMU">
    <img src="/assets/media/yugioh/sets/image_labyrinthe-des-morts.webp" alt="Labyrinthe">
  </a>
</div>
`;

const MTG_FIXTURE = `
<div class="set-card"
    data-set-id="445"
    data-set-type="1"
    data-set-date="2025-09-26"
    data-set-name="Marvel Spiderman"
    data-set-name-en="Marvel's Spider-Man"
    data-set-ref="SPM"
    data-set-ref-en="SPM">
  <a href="/magic/sets/445/marvel-spiderman-spm">
    <img src="/assets/media/magic/sets/icons/icon_marvel-s-spider-man.webp" alt="SPM">
  </a>
</div>
`;

describe("parseFullsetSetsHtml", () => {
  it("parses Yu-Gi-Oh! grid attrs", () => {
    const rows = parseFullsetSetsHtml(YGO_FIXTURE, "yugioh");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fullsetId: "667",
      nameFr: "Le Labyrinthe des Morts",
      nameEn: "Maze of Muertos",
      ref: "MZMU",
      path: "/yugioh/sets/667/le-labyrinthe-des-morts-mzmu",
      iconPath: "/assets/media/yugioh/sets/icons/icon_maze-of-muertos.webp",
    });
  });

  it("parses Magic grid attrs", () => {
    const rows = parseFullsetSetsHtml(MTG_FIXTURE, "magic");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fullsetId: "445",
      nameFr: "Marvel Spiderman",
      nameEn: "Marvel's Spider-Man",
      ref: "SPM",
      path: "/magic/sets/445/marvel-spiderman-spm",
    });
  });
});

describe("foldFullsetSetName / normalizeFullsetSetRef", () => {
  it("folds & → and", () => {
    expect(foldFullsetSetName("Sword & Shield")).toBe(
      foldFullsetSetName("Sword and Shield"),
    );
  });

  it("normalizes refs", () => {
    expect(normalizeFullsetSetRef(" mzmu ")).toBe("MZMU");
    expect(normalizeFullsetSetRef("")).toBeNull();
  });
});
