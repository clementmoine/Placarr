import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  matchPrintsAssetRest,
  printKeyGameForPack,
  resolvePrintFace,
} from "./resolvePrintFace";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

describe("printKeyGameForPack", () => {
  it("uses the first path segment, with known corpus divergences", () => {
    expect(printKeyGameForPack("pokemon")).toBe("pokemon");
    expect(printKeyGameForPack("lorcana")).toBe("lorcana");
    expect(printKeyGameForPack("naruto/carddass")).toBe("naruto");
    expect(printKeyGameForPack("naruto/kayou")).toBe("kayou");
    expect(printKeyGameForPack("dragonball/jcc")).toBe("dbsjcc");
    expect(printKeyGameForPack("dragonball/cg")).toBe("dbscg");
  });
});

describe("matchPrintsAssetRest", () => {
  it("parses shelf-stem URLs for any pack game", () => {
    expect(matchPrintsAssetRest("pokemon", ["prints", "sv1-001-fr", "face"])).toEqual({
      printKey: "pokemon:sv1-001",
      lang: "fr",
      role: "face",
    });
    expect(
      matchPrintsAssetRest("lorcana", ["prints", "1-106-fr", "thumb"]),
    ).toEqual({
      printKey: "lorcana:1-106",
      lang: "fr",
      role: "thumb",
    });
    expect(
      matchPrintsAssetRest("dragonball/jcc", [
        "prints",
        "part1-d0050-fr",
        "face",
      ]),
    ).toEqual({
      printKey: "dbsjcc:part1-d0050",
      lang: "fr",
      role: "face",
    });
  });

  it("keeps Naruto Carddass stem matching", () => {
    expect(
      matchPrintsAssetRest("naruto/carddass", [
        "prints",
        "s1-cl0001-fr",
        "thumb",
      ]),
    ).toEqual({
      printKey: "naruto:s1-cl0001",
      lang: "fr",
      role: "thumb",
    });
  });
});

describe("resolvePrintFace (owned packs)", () => {
  it("prefers AnimeCollection over Coleka glare when both sit on disk", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "print-face-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const dir = path.join(
      root,
      "naruto",
      "ninja-ranks",
      "cards",
      "fr",
      "nr",
      "0026",
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "art.coleka.webp"), "glare");
    fs.writeFileSync(path.join(dir, "art.animecollection.jpg"), "clean");

    const hit = resolvePrintFace({
      pack: "naruto/ninja-ranks",
      printKey: "naruto:nr-0026",
      lang: "fr",
      role: "face",
    });
    expect(hit?.artFile).toBe("art.animecollection.jpg");
  });

  it("prefers eBay studio crop over Coleka listing when both sit on disk (Leclerc)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "print-face-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const dir = path.join(
      root,
      "leclerc",
      "disney25",
      "cards",
      "fr",
      "disney25",
      "001",
    );
    fs.mkdirSync(dir, { recursive: true });
    // coleka sorts before ebay alphabetically — ranking must still pick ebay.
    fs.writeFileSync(path.join(dir, "art.coleka.webp"), "glare");
    fs.writeFileSync(path.join(dir, "art.ebay.jpg"), "clean");

    const hit = resolvePrintFace({
      pack: "leclerc/disney25",
      printKey: "leclerc:disney25-001",
      lang: "fr",
      role: "face",
    });
    expect(hit?.artFile).toBe("art.ebay.jpg");
  });

  it("borrows EN art when IT folder is missing (sd-0004 hole)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "print-face-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const enDir = path.join(
      root,
      "naruto",
      "ninja-ranks",
      "cards",
      "en",
      "sd",
      "0004",
    );
    // Legacy set-first dir must not be treated as a language.
    fs.mkdirSync(path.join(root, "naruto", "ninja-ranks", "cards", "sd"), {
      recursive: true,
    });
    fs.mkdirSync(enDir, { recursive: true });
    fs.writeFileSync(path.join(enDir, "art.reconstructed.webp"), "kakashi");

    const hit = resolvePrintFace({
      pack: "naruto/ninja-ranks",
      printKey: "naruto:sd-0004",
      lang: "it",
      role: "face",
    });
    expect(hit).toMatchObject({
      artFile: "art.reconstructed.webp",
      source: "borrowed",
      disk: { lang: "en", set: "sd", card: "0004" },
    });
  });

  it("honours face.json over filesystem ranking", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "print-face-"));
    roots.push(root);
    vi.stubEnv("PLACARR_DATA_DIR", root);
    const dir = path.join(
      root,
      "naruto",
      "ninja-ranks",
      "cards",
      "fr",
      "nr",
      "0044",
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "art.coleka.webp"), "glare");
    fs.writeFileSync(path.join(dir, "art.animecollection.jpg"), "clean");
    fs.writeFileSync(
      path.join(dir, "face.json"),
      `${JSON.stringify({ art: "art.animecollection.jpg" }, null, 2)}\n`,
    );

    expect(
      resolvePrintFace({
        pack: "naruto/ninja-ranks",
        printKey: "naruto:nr-0044",
        lang: "fr",
      })?.artFile,
    ).toBe("art.animecollection.jpg");
  });
});
