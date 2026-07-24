import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isCorpusGenericToken, buildTokenDocumentFrequency } from "./tokenCorpusIdf";
import {
  __resetTokenCorpusIndexForTests,
  __setTokenCorpusIndexForTests,
  buildTokenCorpusIndexFromTitles,
  getGlobalCorpusTokenStats,
  loadTokenCorpusIndex,
  parseTokenCorpusStats,
  resolveCorpusTokenStats,
  serializeTokenCorpusStats,
  writeTokenCorpusIndex,
} from "./tokenCorpusIndex";

describe("tokenCorpusIndex", () => {
  const originalPath = process.env.TOKEN_CORPUS_INDEX_PATH;
  const originalCache = process.env.TOKEN_CORPUS_CACHE_DIR;
  let tmpRoot: string;

  beforeEach(async () => {
    __resetTokenCorpusIndexForTests();
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "placarr-title-idf-"));
    process.env.TOKEN_CORPUS_CACHE_DIR = tmpRoot;
    process.env.TOKEN_CORPUS_INDEX_PATH = path.join(tmpRoot, "token-df.json");
  });

  afterEach(async () => {
    __resetTokenCorpusIndexForTests();
    if (originalPath === undefined) delete process.env.TOKEN_CORPUS_INDEX_PATH;
    else process.env.TOKEN_CORPUS_INDEX_PATH = originalPath;
    if (originalCache === undefined) delete process.env.TOKEN_CORPUS_CACHE_DIR;
    else process.env.TOKEN_CORPUS_CACHE_DIR = originalCache;
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  });

  it("round-trips serialize / parse", () => {
    const stats = buildTokenCorpusIndexFromTitles([
      "Mario Kart blister",
      "Zelda occasion",
      "Mario Kart Deluxe",
      "Animal Crossing blister",
      "Pokemon occasion",
    ]);
    const parsed = parseTokenCorpusStats(serializeTokenCorpusStats(stats));
    expect(parsed?.docCount).toBe(stats.docCount);
    expect(isCorpusGenericToken("blister", parsed!)).toBe(
      isCorpusGenericToken("blister", stats),
    );
  });

  it("write + load durable index from disk", async () => {
    const stats = buildTokenCorpusIndexFromTitles([
      "Game A blister",
      "Game B blister",
      "Game C blister",
      "Game D unique",
    ]);
    const filePath = await writeTokenCorpusIndex(stats);
    __resetTokenCorpusIndexForTests();
    const loaded = await loadTokenCorpusIndex(filePath);
    expect(loaded?.docCount).toBe(4);
    expect(isCorpusGenericToken("blister", loaded!)).toBe(true);
    expect(isCorpusGenericToken("unique", loaded!)).toBe(false);
  });

  it("missing file yields null — unknown tokens stay signal", async () => {
    expect(await loadTokenCorpusIndex(path.join(tmpRoot, "missing.json"))).toBeNull();
  });

  it("resolveCorpusTokenStats prefers global durable DF over thin batch", () => {
    const global = buildTokenDocumentFrequency([
      "Title One blister",
      "Title Two blister",
      "Title Three blister",
      "Title Four blister",
    ]);
    __setTokenCorpusIndexForTests(global);
    const batch = buildTokenDocumentFrequency([
      "Rare Game blister",
      "Other Title Alpha",
      "Other Title Beta",
    ]);
    expect(isCorpusGenericToken("blister", batch)).toBe(false);
    const resolved = resolveCorpusTokenStats(batch);
    expect(isCorpusGenericToken("blister", resolved)).toBe(true);
  });

  it("reloads global stats when the index file mtime changes", async () => {
    const indexPath = process.env.TOKEN_CORPUS_INDEX_PATH!;
    const first = buildTokenCorpusIndexFromTitles([
      "Alpha blister",
      "Beta blister",
      "Gamma blister",
      "Delta unique",
    ]);
    await writeTokenCorpusIndex(first);
    expect(isCorpusGenericToken("blister", getGlobalCorpusTokenStats()!)).toBe(
      true,
    );

    // Ensure mtime advances on filesystems with 1s resolution.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Simulate another process rewriting the index without touching our RAM cache.
    const second = buildTokenCorpusIndexFromTitles([
      "Alpha special",
      "Beta special",
      "Gamma special",
      "Delta unique",
    ]);
    await fs.writeFile(
      indexPath,
      `${JSON.stringify(serializeTokenCorpusStats(second))}\n`,
      "utf8",
    );

    const reloaded = getGlobalCorpusTokenStats();
    expect(isCorpusGenericToken("blister", reloaded!)).toBe(false);
    expect(isCorpusGenericToken("special", reloaded!)).toBe(true);
  });
});
