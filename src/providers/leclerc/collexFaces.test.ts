import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  COLLEX_LECLERC_COLLECTIONS,
  harvestCollexLeclercFaces,
  installCollexLeclercFaces,
  matchCollexLeclercNumber,
} from "./collexFaces";

const ROWS = [
  { number: "001", fullName: "Woody" },
  { number: "108", fullName: "Germaine" },
  { number: "f01", fullName: "Fixeez — Buzz l'Éclair" },
  { number: "f02", fullName: "Woody" },
  { number: "f03", fullName: "Anna et Elsa" },
  { number: "f04", fullName: "Anna et Elsa" },
];

describe("matchCollexLeclercNumber", () => {
  it("cartes : par numéro imprimé, seulement s'il existe au catalogue", () => {
    expect(matchCollexLeclercNumber({ number: "1", name: "Woody" }, ROWS)).toBe(
      "001",
    );
    expect(matchCollexLeclercNumber({ number: "108", name: "x" }, ROWS)).toBe(
      "108",
    );
    expect(
      matchCollexLeclercNumber({ number: "109", name: "x" }, ROWS),
    ).toBeNull();
  });

  it("Fixeez : par nom (accents, préfixe « Fixeez — » ignorés), jamais ambigu", () => {
    expect(
      matchCollexLeclercNumber({ number: null, name: "Buzz l'Eclair" }, ROWS),
    ).toBe("f01");
    // « Woody » existe en carte 001 et en Fixeez f02 : un objet sans numéro = Fixeez.
    expect(
      matchCollexLeclercNumber({ number: null, name: "Woody" }, ROWS),
    ).toBe("f02");
    // Deux Fixeez du même nom : on ne devine pas.
    expect(
      matchCollexLeclercNumber({ number: null, name: "Anna et Elsa" }, ROWS),
    ).toBeNull();
    expect(
      matchCollexLeclercNumber({ number: null, name: "Stitch" }, ROWS),
    ).toBeNull();
  });
});

describe("COLLEX_LECLERC_COLLECTIONS", () => {
  it("déclare des pages collection ColleX par opération", () => {
    expect(COLLEX_LECLERC_COLLECTIONS.disney26).toContain(
      "https://www.collexstash.com/fr/collections/cards/cartes-disney-leclerc-2026",
    );
    for (const urls of Object.values(COLLEX_LECLERC_COLLECTIONS)) {
      for (const url of urls ?? []) {
        expect(url).toMatch(
          /^https:\/\/www\.collexstash\.com\/fr\/collections\//,
        );
      }
    }
  });
});

describe("harvest + install ColleX", () => {
  it("ledger avec URL par objet, image en staging, face candidate citant l'image", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "collex-"));
    const page =
      '<script>self.__next_f.push([1,"{\\"name\\":\\"Woody\\",\\"itemNumber\\":\\"001\\",\\"slug\\":\\"woody-001\\",\\"imageUrl\\":\\"https://img.collexstash.com/u/items/woody-001.webp?v=1\\"}"])</script>';
    const ledgerPath = path.join(root, "collex-disney26-faces.json");
    const stagingDir = path.join(root, "staging");
    const harvest = await harvestCollexLeclercFaces("disney26", {
      collections: ["https://www.collexstash.com/fr/collections/cards/x"],
      ledgerPath,
      stagingDir,
      fetchHtml: async () => page,
      fetchImage: async () =>
        sharp({
          create: { width: 400, height: 560, channels: 3, background: "#fff" },
        })
          .webp()
          .toBuffer(),
    });
    expect(harvest).toMatchObject({ items: 1, downloaded: 1, failed: 0 });

    const assets: unknown[] = [];
    const installed = await installCollexLeclercFaces(
      {
        listRowsForLanguage: () => ROWS,
        writeAssets: (rows) => {
          assets.push(...rows);
          return { assets: rows.length };
        },
      },
      "disney26",
      { ledgerPath, stagingDir, cardDir: (n) => path.join(root, "cards", n) },
    );
    expect(installed).toEqual({ faces: 1, kept: 0, unmatched: [] });
    expect(existsSync(path.join(root, "cards", "001", "art.collex.webp"))).toBe(
      true,
    );
    expect(assets).toEqual([
      {
        printKey: "leclerc:disney26-001",
        lang: "fr",
        art: "art.collex.webp",
        sourceUrl: "https://www.collexstash.com/fr/collections/cards/x",
      },
    ]);

    // Une face plus grande d'une autre source catalogue reste affichée.
    await sharp({
      create: { width: 1200, height: 1680, channels: 3, background: "#eee" },
    })
      .jpeg()
      .toFile(path.join(root, "cards", "001", "art.scan.jpg"));
    assets.length = 0;
    const again = await installCollexLeclercFaces(
      {
        listRowsForLanguage: () => ROWS,
        writeAssets: (rows) => ({ assets: rows.length }),
      },
      "disney26",
      { ledgerPath, stagingDir, cardDir: (n) => path.join(root, "cards", n) },
    );
    expect(again).toEqual({ faces: 0, kept: 1, unmatched: [] });
    expect(existsSync(path.join(root, "cards", "001", "art.collex.webp"))).toBe(
      true,
    );
    writeFileSync(path.join(root, "done"), "");
  });
});
