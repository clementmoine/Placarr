import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { mapSiteMedThumbsOntoAssets, collectorNumbersWithThumb, installedTinStagingPaths } from "./scrapeCards";
import { materializeTinBoxPromos } from "./tinBoxPromos";
import type { NarutoAssetRow, NarutoPrintRow } from "./indexStore";

const roots: string[] = [];

function tmpPack(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "naruto-move-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("mapSiteMedThumbsOntoAssets", () => {
  it("moves used med into cards/thumb.jpg and clears staging", () => {
    const root = tmpPack();
    const medDir = path.join(
      root,
      "staging",
      "carddass-fr",
      "images",
      "cartes",
      "cartes_med",
    );
    const cardDir = path.join(root, "cards", "s1", "fr", "ni001");
    fs.mkdirSync(medDir, { recursive: true });
    fs.mkdirSync(cardDir, { recursive: true });
    fs.writeFileSync(path.join(cardDir, "art.jpg"), "art");
    fs.writeFileSync(path.join(medDir, "NINJA-001_med.jpg"), "med-bytes");
    fs.writeFileSync(path.join(medDir, "ORPHAN-999_med.jpg"), "orphan");

    const prints: NarutoPrintRow[] = [
      {
        printKey: "naruto:s1-ni001",
        setCode: "s1",
        number: "ni001",
        cardType: "ni",
      },
    ];
    const assets: NarutoAssetRow[] = [
      { printKey: "naruto:s1-ni001", lang: "fr", art: "art.jpg" },
    ];

    const mapped = mapSiteMedThumbsOntoAssets(root, prints, assets);
    expect(mapped).toBe(1);
    expect(fs.readFileSync(path.join(cardDir, "thumb.jpg"), "utf8")).toBe(
      "med-bytes",
    );
    expect(fs.existsSync(path.join(medDir, "NINJA-001_med.jpg"))).toBe(false);
    expect(fs.existsSync(path.join(medDir, "ORPHAN-999_med.jpg"))).toBe(true);
  });

  it("clears staging without rewriting when thumb.jpg already exists", () => {
    const root = tmpPack();
    const medDir = path.join(
      root,
      "staging",
      "carddass-fr",
      "images",
      "cartes",
      "cartes_med",
    );
    const cardDir = path.join(root, "cards", "s1", "fr", "ni001");
    fs.mkdirSync(medDir, { recursive: true });
    fs.mkdirSync(cardDir, { recursive: true });
    fs.writeFileSync(path.join(cardDir, "thumb.jpg"), "existing-thumb");
    fs.writeFileSync(path.join(medDir, "NINJA-001_med.jpg"), "new-med");

    const prints: NarutoPrintRow[] = [
      {
        printKey: "naruto:s1-ni001",
        setCode: "s1",
        number: "ni001",
        cardType: "ni",
      },
    ];
    const assets: NarutoAssetRow[] = [
      { printKey: "naruto:s1-ni001", lang: "fr", art: "art.jpg" },
    ];

    expect(mapSiteMedThumbsOntoAssets(root, prints, assets)).toBe(1);
    expect(fs.readFileSync(path.join(cardDir, "thumb.jpg"), "utf8")).toBe(
      "existing-thumb",
    );
    expect(fs.existsSync(path.join(medDir, "NINJA-001_med.jpg"))).toBe(false);
  });
});

describe("collectorNumbersWithThumb / installedTinStagingPaths", () => {
  it("lists numbers that already have thumb.jpg", () => {
    const root = tmpPack();
    const cardDir = path.join(root, "cards", "s2", "fr", "ta091");
    fs.mkdirSync(cardDir, { recursive: true });
    fs.writeFileSync(path.join(cardDir, "thumb.jpg"), "t");
    expect([...collectorNumbersWithThumb(root)]).toEqual(["ta091"]);
  });

  it("lists tin staging paths once promo art is installed", () => {
    const root = tmpPack();
    const art = path.join(root, "cards", "promo", "fr", "pr011", "art.jpg");
    fs.mkdirSync(path.dirname(art), { recursive: true });
    fs.writeFileSync(art, "oro");
    const paths = installedTinStagingPaths(root);
    expect(paths.has("images/cartes/promo/promo-tin-box-oro.jpg")).toBe(true);
    expect(paths.has("images/cartes/promo/orochimaru_promo.jpg")).toBe(true);
  });
});

describe("materializeTinBoxPromos", () => {
  it("moves used tin faces out of staging", () => {
    const root = tmpPack();
    const staging = path.join(root, "staging", "carddass-fr");
    const artRel = "images/cartes/promo/promo-tin-box-oro.jpg";
    const thumbRel = "images/cartes/promo/orochimaru_promo.jpg";
    const aliasRel = "images/packshots/carte-promo-tb-N2.jpg";
    for (const rel of [artRel, thumbRel, aliasRel]) {
      const abs = path.join(staging, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, rel);
    }
    // Only wire PR-11 sources; PR-16 missing → not installed.
    const art16 = path.join(
      staging,
      "images/cartes/promo/promo-tin-box-naruto.jpg",
    );
    fs.mkdirSync(path.dirname(art16), { recursive: true });
    fs.writeFileSync(art16, "pr016-art");
    fs.writeFileSync(
      path.join(staging, "images/packshots/carte-promo-tb-N1.jpg"),
      "pr016-thumb",
    );

    const { installed } = materializeTinBoxPromos(root);
    expect(installed).toEqual(["pr011", "pr016"]);
    expect(
      fs.existsSync(path.join(root, "cards/promo/fr/pr011/art.jpg")),
    ).toBe(true);
    expect(fs.existsSync(path.join(staging, artRel))).toBe(false);
    expect(fs.existsSync(path.join(staging, thumbRel))).toBe(false);
    // Unused alias stays for inspection.
    expect(fs.existsSync(path.join(staging, aliasRel))).toBe(true);
  });
});
