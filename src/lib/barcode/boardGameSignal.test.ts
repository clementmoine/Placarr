import { describe, expect, it } from "vitest";

import {
  collectPayloadListingNames,
  detectBoardGameSignal,
  detectMediaFormat,
  detectVideoFormatSignal,
  detectVideoGameSignal,
} from "./boardGameSignal";
import { createEmptyBarcodeLookupPayload } from "./lookup/payload";

describe("detectVideoFormatSignal", () => {
  it("repère un format vidéo (LaserDisc/VHS/dessin animé)", () => {
    expect(
      detectVideoFormatSignal([
        'Laserdisc📀 TOY STORY (PAL) 1 disque " WALT DISNEY "',
      ]),
    ).toBe(1);
    expect(
      detectVideoFormatSignal([
        "Occasion : Laserdisc - Dessin Animé TOY STORY de DISNEY",
      ]),
    ).toBe(1);
    expect(detectVideoFormatSignal(["Star Wars VHS Collector"])).toBe(1);
  });

  it("ne signale pas un produit non vidéo (CD, jeu, DVD ambigu)", () => {
    expect(detectVideoFormatSignal(["Toy Story Bande Originale CD"])).toBe(0);
    expect(detectVideoFormatSignal(["Mario Kart Wii"])).toBe(0);
    expect(detectVideoFormatSignal(["Toy Story 2 DVD"])).toBe(0);
  });
});

describe("detectVideoGameSignal", () => {
  it("repère une plateforme console nommée dans les annonces", () => {
    expect(detectVideoGameSignal(["Tom Clancy's Ghost Recon Xbox"])).toBe(1);
    expect(detectVideoGameSignal(["Ghost Recon : Silent Weapon Xbox"])).toBe(1);
    expect(detectVideoGameSignal(["Zelda Ocarina of Time Nintendo 64"])).toBe(
      1,
    );
    expect(detectVideoGameSignal(["Mario Kart Wii"])).toBe(1);
  });

  it("n'invente pas de signal sans plateforme console (PC exclu, CD/album)", () => {
    expect(detectVideoGameSignal(["Ghost Recon — Classics"])).toBe(0);
    expect(detectVideoGameSignal(["Best of PC Music"])).toBe(0);
    expect(detectVideoGameSignal(["Toy Story Bande Originale CD"])).toBe(0);
    expect(detectVideoGameSignal(["", "   "])).toBe(0);
  });
});

describe("detectMediaFormat", () => {
  it("renvoie le libellé du format physique le plus spécifique", () => {
    expect(
      detectMediaFormat([
        'Laserdisc📀 TOY STORY (PAL) 1 disque " WALT DISNEY "',
      ]),
    ).toBe("LaserDisc");
    expect(detectMediaFormat(["Star Wars VHS Collector"])).toBe("VHS");
    expect(detectMediaFormat(["Toy Story Blu-ray Disney"])).toBe("Blu-ray");
    expect(detectMediaFormat(["Le Roi Lion DVD"])).toBe("DVD");
  });

  it("renvoie null sans format reconnu", () => {
    expect(detectMediaFormat(["Toy Story"])).toBeNull();
    expect(detectMediaFormat([])).toBeNull();
  });
});

describe("detectBoardGameSignal", () => {
  it("returns the strongest signal for a category phrase (accents stripped)", () => {
    expect(detectBoardGameSignal(["Jeu de société - Mille sabords"])).toBe(1);
    expect(detectBoardGameSignal(["jeu de societe Mille Sabords"])).toBe(1);
    expect(detectBoardGameSignal(["Mille Sabords - jeu de plateau"])).toBe(1);
    expect(detectBoardGameSignal(["Catan board game"])).toBe(1);
  });

  it("does NOT fire on a publisher name alone (no hardcoded publisher list)", () => {
    // The publisher list was removed: a publisher name is a never-complete entity
    // list. Authoritative board-game identity now comes from a specialist provider
    // (see detectBoardGameSpecialistSignal in barcodeResolver), not from names.
    expect(detectBoardGameSignal(["Mille Sabords FR Gigamic"])).toBe(0);
    expect(
      detectBoardGameSignal(["Les Aventuriers du Rail Days of Wonder"]),
    ).toBe(0);
  });

  it("detects the category phrase among several names", () => {
    expect(detectBoardGameSignal(["Mille Sabords FR", "Jeu de société"])).toBe(
      1,
    );
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
