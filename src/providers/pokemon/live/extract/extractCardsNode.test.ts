import { mkdirSync, mkdtempSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { BUNDLE_LEDGER_VERSION } from "./bundleLedger";
import { extractCardsNode } from "./extractCardsNode";
import {
  isCardTextureExtractFresh,
  writeExtractSidecar,
} from "./extractCardTextures";
import { mergeKeyedCards, type KeyedCardVariant } from "./buildRuntimeCards";

const SAMPLE_ROW = {
  bundle: "xy1_en_001",
  variant: "std" as const,
  shaderPath: "holo",
  foil: "holo",
  cardTex: "art.webp",
  maskTex: "mask.webp",
  matPath: "mat",
  coldFoil: "",
  etch: "",
};

describe("isCardTextureExtractFresh", () => {
  it("trusts CDN hash even when art mtime is older than the bundle", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fresh-hash-"));
    const art = path.join(dir, "art.webp");
    writeFileSync(art, "art");
    // Art older than bundle clock.
    utimesSync(art, new Date("2020-01-01"), new Date("2020-01-01"));
    expect(
      isCardTextureExtractFresh({
        artPath: art,
        bundleMtimeSec: Date.now() / 1000,
        bundleSize: 100,
        textureMode: "cards",
        sidecar: {
          bundleMtime: 1,
          textureMode: "cards",
          rows: [SAMPLE_ROW],
          bundleHash: "abc",
          bundleSize: 99,
        },
        bundleHash: "abc",
      }),
    ).toBe(true);
  });

  it("trusts a sidecar stamped for the current bundle mtime (art not touched)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fresh-side-"));
    const art = path.join(dir, "art.webp");
    writeFileSync(art, "art");
    utimesSync(art, new Date("2020-01-01"), new Date("2020-01-01"));
    const bundleMtimeSec = 1787779412.75004;
    expect(
      isCardTextureExtractFresh({
        artPath: art,
        bundleMtimeSec,
        bundleSize: 200,
        textureMode: "cards",
        sidecar: {
          bundleMtime: bundleMtimeSec,
          textureMode: "cards",
          rows: [SAMPLE_ROW],
        },
        bundleHash: "whatever",
      }),
    ).toBe(true);
  });

  it("re-extracts when the CDN hash moved", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fresh-stale-"));
    const art = path.join(dir, "art.webp");
    writeFileSync(art, "art");
    utimesSync(art, new Date("2020-01-01"), new Date("2020-01-01"));
    expect(
      isCardTextureExtractFresh({
        artPath: art,
        bundleMtimeSec: Date.now() / 1000,
        bundleSize: 100,
        textureMode: "cards",
        sidecar: {
          bundleMtime: 1,
          textureMode: "cards",
          rows: [SAMPLE_ROW],
          bundleHash: "old",
        },
        bundleHash: "new",
      }),
    ).toBe(false);
  });
});

describe("extractCardsNode skip path", () => {
  it("keeps sidecar rows when art is already newer than the bundle", async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "cards-node-"));
    const prev = process.env.PLACARR_DATA_DIR;
    process.env.PLACARR_DATA_DIR = path.join(repo, "data");
    try {
      const bundlesDir = path.join(repo, "bundles");
      const faceDir = path.join(repo, "data/pokemon/cards/xy1/en/001");
      mkdirSync(bundlesDir, { recursive: true });
      mkdirSync(faceDir, { recursive: true });
      const bundlePath = path.join(bundlesDir, "xy1_en_001");
      writeFileSync(bundlePath, "bundle");
      writeFileSync(path.join(faceDir, "art.webp"), "art");
      writeExtractSidecar(faceDir, 1, "cards", [SAMPLE_ROW]);

      const result = await extractCardsNode({ repo, bundlesDir });
      expect(result.skipped).toBe(1);
      expect(result.written).toBe(0);
      expect(result.rows).toEqual([SAMPLE_ROW]);
    } finally {
      if (prev === undefined) delete process.env.PLACARR_DATA_DIR;
      else process.env.PLACARR_DATA_DIR = prev;
    }
  });

  it("skips when CDN hash matches even if the bundle file was re-touched", async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "cards-node-hash-"));
    const prev = process.env.PLACARR_DATA_DIR;
    process.env.PLACARR_DATA_DIR = path.join(repo, "data");
    try {
      const staging = path.join(repo, "staging");
      const bundlesDir = path.join(staging, "cdn-bundles");
      const faceDir = path.join(repo, "data/pokemon/cards/me2-5/de/001");
      mkdirSync(bundlesDir, { recursive: true });
      mkdirSync(faceDir, { recursive: true });

      const bundlePath = path.join(bundlesDir, "me2-5_de_001");
      writeFileSync(bundlePath, "bundle-v2");
      // Bundle "newer" than art (the mtime trap).
      const now = new Date();
      utimesSync(bundlePath, now, now);
      const artPath = path.join(faceDir, "art.webp");
      writeFileSync(artPath, "art");
      utimesSync(artPath, new Date("2020-01-01"), new Date("2020-01-01"));
      writeExtractSidecar(faceDir, 1, "cards", [SAMPLE_ROW], {
        bundleHash: "hash-me2",
        bundleSize: 8,
      });
      writeFileSync(
        path.join(staging, "cdn-bundle-versions.json.gz"),
        gzipSync(
          Buffer.from(
            `${JSON.stringify({
              version: BUNDLE_LEDGER_VERSION,
              entries: {
                "me2-5_de_001": {
                  hash: "hash-me2",
                  at: "2026-01-01T00:00:00.000Z",
                },
              },
            })}\n`,
            "utf8",
          ),
        ),
      );

      const result = await extractCardsNode({
        repo,
        bundlesDir,
        ledgerRoot: staging,
      });
      expect(result.skipped).toBe(1);
      expect(result.written).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.PLACARR_DATA_DIR;
      else process.env.PLACARR_DATA_DIR = prev;
    }
  });

  it("skips when sidecar mtime matches the bundle even if art.webp is older", async () => {
    const repo = mkdtempSync(path.join(tmpdir(), "cards-node-side-"));
    const prev = process.env.PLACARR_DATA_DIR;
    process.env.PLACARR_DATA_DIR = path.join(repo, "data");
    try {
      const bundlesDir = path.join(repo, "bundles");
      const faceDir = path.join(repo, "data/pokemon/cards/me2-5/de/002");
      mkdirSync(bundlesDir, { recursive: true });
      mkdirSync(faceDir, { recursive: true });
      const bundlePath = path.join(bundlesDir, "me2-5_de_002");
      writeFileSync(bundlePath, "bundle");
      const bundleMtimeSec = statSync(bundlePath).mtimeMs / 1000;
      const artPath = path.join(faceDir, "art.webp");
      writeFileSync(artPath, "art");
      utimesSync(artPath, new Date("2020-01-01"), new Date("2020-01-01"));
      writeExtractSidecar(faceDir, bundleMtimeSec, "cards", [SAMPLE_ROW]);

      const result = await extractCardsNode({ repo, bundlesDir });
      expect(result.skipped).toBe(1);
      expect(result.written).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.PLACARR_DATA_DIR;
      else process.env.PLACARR_DATA_DIR = prev;
    }
  });
});

describe("mergeKeyedCards", () => {
  const variant = (foil: string): KeyedCardVariant => ({
    foil,
    shader: foil,
    cardTex: "art.webp",
    maskTex: "mask.webp",
  });

  it("overlays new bundles without dropping previous ones", () => {
    const merged = mergeKeyedCards(
      { old_en_001: { std: variant("a"), ph: variant("a") } },
      { new_en_002: { std: variant("b"), ph: variant("b") } },
    );
    expect(Object.keys(merged).sort()).toEqual(["new_en_002", "old_en_001"]);
  });
});
