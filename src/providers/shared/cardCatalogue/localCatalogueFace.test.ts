import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  probeLocalArtBasename,
  resolveCatalogueLocalArtUrl,
  sqliteArtBasename,
} from "./localCatalogueFace";

describe("sqliteArtBasename", () => {
  it("keeps basenames and rejects CDN / paths", () => {
    expect(sqliteArtBasename("art.bandai.webp")).toBe("art.bandai.webp");
    expect(sqliteArtBasename("https://cdn.example/art.png")).toBeNull();
    expect(sqliteArtBasename("fr/bt1/001/art.webp")).toBeNull();
    expect(sqliteArtBasename("")).toBeNull();
  });
});

describe("probeLocalArtBasename", () => {
  it("prefers an existing basename then scans art*", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "placarr-art-"));
    writeFileSync(path.join(dir, "art.b.webp"), "x");
    writeFileSync(path.join(dir, "art.a.webp"), "x");
    expect(probeLocalArtBasename(dir, "art.b.webp")).toBe("art.b.webp");
    expect(probeLocalArtBasename(dir)).toBe("art.a.webp");
    expect(probeLocalArtBasename(dir, "missing.webp")).toBe("art.a.webp");
  });
});

describe("resolveCatalogueLocalArtUrl", () => {
  it("does not mint CDN sqlite leftovers", () => {
    const got = resolveCatalogueLocalArtUrl({
      packId: "dragonball/cg",
      set: "__no_such_set__",
      lang: "fr",
      card: "001",
      sqliteArt: "https://www.dbs-cardgame.com/card.png",
    });
    expect(got.artUrl).toBe("");
    expect(got.missingArt).toBe(true);
  });

  it("honours resolveDiskFile over sqlite CDN", () => {
    const got = resolveCatalogueLocalArtUrl({
      packId: "dragonball/cg",
      set: "bt1",
      lang: "fr",
      card: "001",
      sqliteArt: "https://cdn.example/x.png",
      resolveDiskFile: () => "art.disk.webp",
    });
    expect(got.missingArt).toBe(false);
    expect(got.artFile).toBe("art.disk.webp");
    expect(got.artUrl).toContain(
      "/assets/dragonball/cg/cards/fr/bt1/001/art.disk.webp",
    );
  });
});
