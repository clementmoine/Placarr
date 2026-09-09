import { describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import sharp from "sharp";

import {
  curatedDestStale,
  destBackWebpName,
  installCuratedCardBacks,
  listCuratedBackSources,
} from "./curatedCardsInstall";

async function tinyPng(filePath: string): Promise<void> {
  mkdirSync(path.dirname(filePath), { recursive: true });
  await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#112233" },
  })
    .png()
    .toFile(filePath);
}

function tmpRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "curated-cards-"));
}

describe("destBackWebpName", () => {
  it("maps raster backs to canonical webp names", () => {
    expect(destBackWebpName("back.png")).toBe("back.webp");
    expect(destBackWebpName("back.webp")).toBe("back.webp");
    expect(destBackWebpName("back.fr.png")).toBe("back.fr.webp");
    expect(destBackWebpName("back.it.png")).toBe("back.it.webp");
    expect(destBackWebpName("back.ja.png")).toBe("back.ja.webp");
    expect(destBackWebpName("back.ur.png")).toBe("back.ur.webp");
    expect(destBackWebpName("BACK.PNG")).toBe("back.webp");
    expect(destBackWebpName("art.png")).toBeNull();
    expect(destBackWebpName("BACK.md")).toBeNull();
  });
});

describe("listCuratedBackSources", () => {
  it("treats the tree as the destination — pack vs set, not a filename code", async () => {
    const root = tmpRoot();
    const cards = path.join(root, "cards");
    await tinyPng(path.join(cards, "back.png"));
    await tinyPng(path.join(cards, "back.it.png"));
    await tinyPng(path.join(cards, "s28", "back.png"));
    writeFileSync(path.join(cards, "BACK.md"), "ignored");
    await tinyPng(path.join(cards, "s28", "fr", "back.png"));

    const listed = listCuratedBackSources(cards).map((row) => row.destRel);
    expect(listed).toEqual(["back.it.webp", "back.webp", "s28/back.webp"]);
  });
});

describe("installCuratedCardBacks", () => {
  it("keeps language-qualified pack versos as back.<lang>.webp", async () => {
    const root = tmpRoot();
    const srcCards = path.join(root, "curated", "cards");
    const destCards = path.join(root, "data", "cards");
    await tinyPng(path.join(srcCards, "back.fr.png"));
    await tinyPng(path.join(srcCards, "back.ja.png"));

    const rows = await installCuratedCardBacks({
      curatedCardsDir: srcCards,
      destCardsDir: destCards,
    });
    expect(rows.filter((r) => r.installed)).toHaveLength(2);
    expect(existsSync(path.join(destCards, "back.fr.webp"))).toBe(true);
    expect(existsSync(path.join(destCards, "back.ja.webp"))).toBe(true);
    expect(existsSync(path.join(destCards, "back.webp"))).toBe(false);
  });

  it("mirrors pack and set backs into the same relative directories", async () => {
    const root = tmpRoot();
    const srcCards = path.join(root, "curated", "cards");
    const destCards = path.join(root, "data", "cards");
    await tinyPng(path.join(srcCards, "back.png"));
    await tinyPng(path.join(srcCards, "s28", "back.png"));

    const rows = await installCuratedCardBacks({
      curatedCardsDir: srcCards,
      destCardsDir: destCards,
    });
    expect(rows.filter((r) => r.installed)).toHaveLength(2);
    expect(existsSync(path.join(destCards, "back.webp"))).toBe(true);
    expect(existsSync(path.join(destCards, "s28", "back.webp"))).toBe(true);
    expect(existsSync(path.join(destCards, "back.png"))).toBe(false);
  });

  it("warns when a sleeve is dropped inside a locale folder", async () => {
    const root = tmpRoot();
    const srcCards = path.join(root, "curated", "cards");
    await tinyPng(path.join(srcCards, "s28", "fr", "back.png"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = await installCuratedCardBacks({
      curatedCardsDir: srcCards,
      destCardsDir: path.join(root, "data", "cards"),
    });
    expect(rows).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/s28\/fr\/back\.png/);
    warn.mockRestore();
  });

  it("is a no-op write on dryRun", async () => {
    const root = tmpRoot();
    const srcCards = path.join(root, "curated", "cards");
    const destCards = path.join(root, "data", "cards");
    await tinyPng(path.join(srcCards, "back.png"));
    const rows = await installCuratedCardBacks({
      curatedCardsDir: srcCards,
      destCardsDir: destCards,
      dryRun: true,
    });
    expect(rows).toEqual([
      {
        src: path.join(srcCards, "back.png"),
        dest: path.join(destCards, "back.webp"),
        installed: true,
      },
    ]);
    expect(existsSync(path.join(destCards, "back.webp"))).toBe(false);
  });

  it("copies an already-webp back without transcoding", async () => {
    const root = tmpRoot();
    const src = path.join(root, "curated", "cards", "back.webp");
    const destCards = path.join(root, "data", "cards");
    mkdirSync(path.dirname(src), { recursive: true });
    await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#445566" },
    })
      .webp({ lossless: true })
      .toFile(src);
    const before = readFileSync(src);
    await installCuratedCardBacks({
      curatedCardsDir: path.dirname(src),
      destCardsDir: destCards,
    });
    expect(readFileSync(path.join(destCards, "back.webp"))).toEqual(before);
  });
});

describe("curatedDestStale", () => {
  it("is stale when dest is missing", () => {
    const root = tmpRoot();
    const src = path.join(root, "src.png");
    writeFileSync(src, "x");
    expect(curatedDestStale(src, path.join(root, "missing.webp"))).toBe(true);
  });
});
