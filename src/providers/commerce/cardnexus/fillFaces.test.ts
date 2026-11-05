import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cardnexusImageDownloadUrl,
  fillCardnexusFaces,
} from "./fillFaces";

vi.mock("./client", () => ({
  cardnexusApiKey: () => "cnk_live_test",
}));

describe("cardnexusImageDownloadUrl", () => {
  it.each([
    [
      "https://img.cardnexus.com/pokemon/x.jpg/p1200.png",
      "https://img.cardnexus.com/pokemon/x.jpg",
    ],
    [
      "https://img.cardnexus.com/pokemon/x.png/p600.png",
      "https://img.cardnexus.com/pokemon/x.png",
    ],
    [
      "https://img.cardnexus.com/pokemon/plain.webp",
      "https://img.cardnexus.com/pokemon/plain.webp",
    ],
  ])("%s → %s", (input, expected) => {
    expect(cardnexusImageDownloadUrl(input)).toBe(expected);
  });
});

describe("fillCardnexusFaces", () => {
  const dirs: string[] = [];
  afterEach(() => {
    dirs.length = 0;
  });

  it("writes art.cardnexus.jpg from product imageUrl", async () => {
    const cardDir = mkdtempSync(path.join(os.tmpdir(), "cn-face-"));
    dirs.push(cardDir);

    const report = await fillCardnexusFaces(
      [{ printKey: "lorcana:12-223", cardDir, language: "en" }],
      {
        fetchProduct: async () => ({
          id: 1,
          gameId: "lorcana",
          name: "Jessie",
          imageUrl: "https://img.cardnexus.com/lorcana/j.jpg/p1200.png",
          productType: "card",
        }),
        downloadImage: async () => Buffer.alloc(1200, 7),
      },
    );

    expect(report.written).toBe(1);
    expect(existsSync(path.join(cardDir, "art.cardnexus.jpg"))).toBe(true);
    expect(readFileSync(path.join(cardDir, "art.cardnexus.jpg")).length).toBe(
      1200,
    );
  });

  it("skips when art.cardnexus already exists", async () => {
    const cardDir = mkdtempSync(path.join(os.tmpdir(), "cn-face-skip-"));
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(cardDir, "art.cardnexus.webp"), "x");

    const fetchProduct = vi.fn();
    const report = await fillCardnexusFaces(
      [{ printKey: "lorcana:12-1", cardDir }],
      { fetchProduct },
    );
    expect(report.skipped).toBe(1);
    expect(fetchProduct).not.toHaveBeenCalled();
  });
});
