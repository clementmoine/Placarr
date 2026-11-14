import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { packCardDir } from "@/lib/packPaths";

import {
  buildCatalogueDiskFaceAttachments,
  listCatalogueArtBasenames,
} from "./catalogueDiskFaceAttachments";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "disk-face-att-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("buildCatalogueDiskFaceAttachments", () => {
  it("lists lang-first art dumps and stamps artKind", () => {
    tmpDataRoot();
    const packId = "dragonball/cg";
    const diskId = { set: "bt1", lang: "en", card: "001" };
    const dir = packCardDir(packId, diskId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "art.dbscards.webp"), "");
    fs.writeFileSync(path.join(dir, "art.sample.webp"), "");

    expect(listCatalogueArtBasenames(dir).sort()).toEqual([
      "art.dbscards.webp",
      "art.sample.webp",
    ]);

    const result = buildCatalogueDiskFaceAttachments({
      packId,
      diskId,
      preferredArt: "art.dbscards.webp",
      providerId: "dbscg",
      printGame: "dbscg",
      title: "Champa",
    });

    expect(result.defaultUrl).toBe(
      "/assets/dragonball/cg/cards/en/bt1/001/art.dbscards.webp",
    );
    expect(result.attachments).toHaveLength(2);
    expect(result.attachments[0]).toMatchObject({
      url: "/assets/dragonball/cg/cards/en/bt1/001/art.dbscards.webp",
      role: "dbscg-face-en-dbscards",
      artKind: "dump",
      watermarked: false,
    });
    expect(result.attachments[1]).toMatchObject({
      url: "/assets/dragonball/cg/cards/en/bt1/001/art.sample.webp",
      role: "dbscg-face-en-sample",
      artKind: "sample",
      watermarked: true,
    });
  });

  it("returns empty when the card folder has no art dumps", () => {
    tmpDataRoot();
    const result = buildCatalogueDiskFaceAttachments({
      packId: "dragonball/fw",
      diskId: { set: "st01", lang: "en", card: "001" },
      providerId: "dbsfw",
      printGame: "dbsfw",
      title: "Son Goten",
    });
    expect(result).toEqual({ attachments: [], defaultUrl: null });
  });

  it("accepts prelisted artFiles + sourceTokenForFile (Pokémon merge)", () => {
    tmpDataRoot();
    const result = buildCatalogueDiskFaceAttachments({
      packId: "pokemon",
      diskId: { set: "sv08", lang: "fr", card: "042" },
      preferredArt: "art.webp",
      providerId: "tcgdex",
      printGame: "pokemon",
      title: "Pikachu",
      artFiles: ["art.webp", "art.coleka.webp"],
      sourceTokenForFile: (file) =>
        file.includes("coleka") ? "coleka" : "live",
    });
    expect(result.attachments.map((a) => a.role)).toEqual([
      "pokemon-face-fr-live",
      "pokemon-face-fr-coleka",
    ]);
  });

  it("orders by preferredArt but stamps indexedWinnerArt (Naruto)", () => {
    tmpDataRoot();
    const result = buildCatalogueDiskFaceAttachments({
      packId: "naruto/carddass",
      diskId: { set: "s1", lang: "fr", card: "ni0017" },
      preferredArt: "art.carddass.jpg",
      indexedWinnerArt: "art.coleka.webp",
      winnerArtKind: "sample",
      winnerWatermarked: true,
      providerId: "narutocarddass",
      printGame: "naruto",
      title: "Haku",
      artFiles: ["art.carddass.jpg", "art.coleka.webp"],
      sourceTokenForFile: (file) =>
        file.includes("coleka") ? "coleka" : "carddass",
      coverProvenanceForFile: (file) =>
        file.includes("coleka") ? "listing_photo" : "catalog",
    });
    expect(result.attachments[0]?.url).toContain("art.carddass.jpg");
    expect(result.attachments[0]).toMatchObject({
      artKind: "dump",
      coverProvenance: "catalog",
    });
    expect(result.attachments[1]).toMatchObject({
      artKind: "sample",
      watermarked: true,
      coverProvenance: "listing_photo",
    });
  });
});
