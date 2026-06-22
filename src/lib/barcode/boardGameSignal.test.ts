import { describe, expect, it } from "vitest";

import {
  collectPayloadListingNames,
  detectBoardGameSignal,
} from "./boardGameSignal";
import { createEmptyBarcodeLookupPayload } from "./lookupPayload";

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
    payload.boardRetailers = [
      { providerName: "Monsieur de", title: "Mille Sabords - Gigamic" },
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
