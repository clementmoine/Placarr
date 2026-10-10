import { describe, expect, it } from "vitest";

import { createCardFaceChoice } from "./cardFaces";

describe("areaDecidesBelow", () => {
  /*
    Relevé le 2026-08-20 sur `booster-s4` : une vignette de boutique 200×300,
    rembourrée jusqu'au 2:3 idéal, scorait 656 contre 632 pour une photo
    286×500 qui montre deux fois plus de pack. Sous le plancher de résolution
    du scorer, le bonus de ratio mesure le cadre, pas le produit.
  */
  const choice = createCardFaceChoice<"petit" | "grand">({
    sources: ["petit", "grand"],
    priority: { fr: ["petit", "grand"] },
    areaDecidesBelow: 200_000,
  });

  it("prend la plus grande quand les deux sont sous le plancher", () => {
    const best = choice.pickBestFace(
      [
        { source: "petit", file: "art.petit.jpg", width: 200, height: 300 },
        { source: "grand", file: "art.grand.jpg", width: 286, height: 500 },
      ],
      "fr",
    );
    expect(best).toBe("grand");
  });

  it("laisse le score décider dès qu'une image passe le plancher", () => {
    // 800×1200 = 0,96 MP : le scorer sait de nouveau départager.
    const best = choice.pickBestFace(
      [
        { source: "petit", file: "art.petit.jpg", width: 800, height: 1200 },
        { source: "grand", file: "art.grand.jpg", width: 286, height: 500 },
      ],
      "fr",
    );
    expect(best).toBe("petit");
  });

  it("retombe sur la priorité à surface égale", () => {
    const best = choice.pickBestFace(
      [
        { source: "grand", file: "art.grand.jpg", width: 200, height: 300 },
        { source: "petit", file: "art.petit.jpg", width: 200, height: 300 },
      ],
      "fr",
    );
    expect(best).toBe("petit");
  });

  it("sans l'option, le comportement d'avant est intact", () => {
    const plain = createCardFaceChoice<"petit" | "grand">({
      sources: ["petit", "grand"],
      priority: { fr: ["petit", "grand"] },
    });
    // La vignette rembourrée gagnait, et gagne toujours : rien n'a bougé pour
    // les appelants qui ne demandent pas la règle.
    expect(
      plain.pickBestFace(
        [
          { source: "petit", file: "art.petit.jpg", width: 200, height: 300 },
          { source: "grand", file: "art.grand.jpg", width: 286, height: 500 },
        ],
        "fr",
      ),
    ).toBe("petit");
  });
});
