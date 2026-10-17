import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  attachNarutoDiskArtAssets,
  buildIndexFromDisk,
} from "./scrapeCards";

describe("buildIndexFromDisk promo faces", () => {
  it("indexes promo art without pack_documents appearances", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-promo-disk-"));
    const cardDir = path.join(root, "cards", "promo", "pr0011", "fr");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.carddass.jpg"), "face");

    const { assets, prints } = buildIndexFromDisk(root);

    expect(
      prints.some(
        (p) => p.printKey === "naruto:promo-pr0011" && p.number === "pr0011",
      ),
    ).toBe(true);
    expect(
      assets.some(
        (a) =>
          a.printKey === "naruto:promo-pr0011" &&
          a.lang === "fr" &&
          a.art === "art.carddass.jpg",
      ),
    ).toBe(true);
  });

  it("indexes reconstructed-only promo faces", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-promo-recon-"));
    const cardDir = path.join(root, "cards", "promo", "pr0093", "fr");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.reconstructed.webp"), "recon");
    writeFileSync(
      path.join(cardDir, "face.json"),
      JSON.stringify({ art: "art.reconstructed.webp" }),
    );

    const { assets } = buildIndexFromDisk(root);

    expect(
      assets.some(
        (a) =>
          a.printKey === "naruto:promo-pr0093" &&
          a.lang === "fr" &&
          a.art === "art.reconstructed.webp",
      ),
    ).toBe(true);
  });

  it("indexes JA 巻ノ faces without FR checklist appearances", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-maki-disk-"));
    const cardDir = path.join(root, "cards", "ninja", "ni0344", "ja");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.suruga.jpg"), "face");

    const { assets, prints } = buildIndexFromDisk(root);

    expect(
      prints.some(
        (p) => p.printKey === "naruto:maki15-ni0344" && p.setCode === "maki15",
      ),
    ).toBe(true);
    expect(
      assets.some(
        (a) =>
          a.printKey === "naruto:maki15-ni0344" &&
          a.lang === "ja" &&
          a.art === "art.suruga.jpg",
      ),
    ).toBe(true);
  });
});

describe("attachNarutoDiskArtAssets", () => {
  it("fills titled printKeys that missed the disk walk", () => {
    const root = mkdtempSync(path.join(tmpdir(), "naruto-attach-disk-"));
    const cardDir = path.join(root, "cards", "ninja", "ni0181", "ja");
    mkdirSync(cardDir, { recursive: true });
    writeFileSync(path.join(cardDir, "art.suruga.jpg"), "face");

    const { assets, attached } = attachNarutoDiskArtAssets({
      prints: [
        {
          printKey: "naruto:maki15-ni0181",
          setCode: "maki15",
          number: "ni0181",
          cardType: "ni",
        },
      ],
      titles: [{ printKey: "naruto:maki15-ni0181", lang: "ja" }],
      assets: [],
      cardsRoot: path.join(root, "cards"),
    });

    expect(attached).toBe(1);
    expect(assets).toEqual([
      expect.objectContaining({
        printKey: "naruto:maki15-ni0181",
        lang: "ja",
        art: "art.suruga.jpg",
      }),
    ]);
  });
});
