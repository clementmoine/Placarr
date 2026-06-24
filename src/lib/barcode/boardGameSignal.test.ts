import { describe, expect, it } from "vitest";

import {
  collectPayloadListingNames,
  detectBoardGameSignal,
  detectVideoFormatSignal,
} from "./boardGameSignal";
import { createEmptyBarcodeLookupPayload } from "./lookupPayload";

describe("detectVideoFormatSignal", () => {
  it("repère un format vidéo (LaserDisc/VHS/dessin animé)", () => {
    expect(
      detectVideoFormatSignal(['Laserdisc📀 TOY STORY (PAL) 1 disque " WALT DISNEY "']),
    ).toBe(1);
    expect(
      detectVideoFormatSignal(["Occasion : Laserdisc - Dessin Animé TOY STORY de DISNEY"]),
    ).toBe(1);
    expect(detectVideoFormatSignal(["Star Wars VHS Collector"])).toBe(1);
  });

  it("ne signale pas un produit non vidéo (CD, jeu, DVD ambigu)", () => {
    expect(detectVideoFormatSignal(["Toy Story Bande Originale CD"])).toBe(0);
    expect(detectVideoFormatSignal(["Mario Kart Wii"])).toBe(0);
    expect(detectVideoFormatSignal(["Toy Story 2 DVD"])).toBe(0);
  });
});

describe("detectBoardGameSignal", () => {
  it("returns the strongest signal for a category phrase (accents stripped)", () => {
    expect(detectBoardGameSignal(["Jeu de société - Mille sabords"])).toBe(1);
    expect(detectBoardGameSignal(["jeu de societe Mille Sabords"])).toBe(1);
    expect(detectBoardGameSignal(["Mille Sabords - jeu de plateau"])).toBe(1);
    expect(detectBoardGameSignal(["Catan board game"])).toBe(1);
  });

  it("returns a medium signal for a board-game publisher", () => {
    expect(detectBoardGameSignal(["Mille Sabords FR Gigamic"])).toBe(0.6);
    expect(detectBoardGameSignal(["Les Aventuriers du Rail Days of Wonder"])).toBe(
      0.6,
    );
  });

  it("prefers the category phrase over a lone publisher mention", () => {
    expect(
      detectBoardGameSignal(["Mille Sabords Gigamic", "Jeu de société"]),
    ).toBe(1);
  });

  it("returns 0 for video-game / unrelated listings", () => {
    expect(
      detectBoardGameSignal([
        "Star Wars Episode III - Xbox - FR",
        "Zelda Ocarina of Time Nintendo 64",
      ]),
    ).toBe(0);
  });

  it("does not fire on bare 'jeu' without the board-game category", () => {
    expect(detectBoardGameSignal(["Jeu vidéo PS4 FIFA 23"])).toBe(0);
  });

  it("ignores empty / blank names", () => {
    expect(detectBoardGameSignal(["", "   "])).toBe(0);
  });
});

describe("collectPayloadListingNames", () => {
  it("gathers names from marketplace listings, board anchors and LeDenicheur", () => {
    const payload = createEmptyBarcodeLookupPayload();
    payload.amc = [{ name: "Mille Sabords FR Gigamic" }];
    payload.picclick = [{ name: "Jeu de société Mille Sabords" }];
    payload.philibert = { title: "Mille Sabords" };
    payload.retailers = [
      {
        providerName: "Monsieur de",
        title: "Mille Sabords - Gigamic",
        types: ["boardgames"],
      },
    ];
    payload.leDenicheur = { productName: "Mille Sabords" } as never;

    const names = collectPayloadListingNames(payload);

    expect(names).toEqual(
      expect.arrayContaining([
        "Mille Sabords FR Gigamic",
        "Jeu de société Mille Sabords",
        "Mille Sabords",
        "Mille Sabords - Gigamic",
      ]),
    );
    expect(detectBoardGameSignal(names)).toBe(1);
  });
});
