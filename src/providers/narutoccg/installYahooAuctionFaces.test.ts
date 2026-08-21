import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { NARUTO_FACE_DECISION_FILE } from "./faceChoice";
import { installYahooAuctionFaces } from "./installYahooAuctionFaces";

const dirs: string[] = [];

function tmp(): string {
  const dir = path.join(
    os.tmpdir(),
    `naruto-yahoo-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("installYahooAuctionFaces", () => {
  it("copies curated source.jpg as art.yahoo and does not mint 忍-3", async () => {
    const packRoot = tmp();
    const curatedRoot = tmp();
    const srcDir = path.join(curatedRoot, "cards", "ninja", "ni0019", "ja");
    mkdirSync(srcDir, { recursive: true });
    const jpeg = await sharp({
      create: {
        width: 40,
        height: 56,
        channels: 3,
        background: { r: 200, g: 40, b: 40 },
      },
    })
      .jpeg()
      .toBuffer();
    writeFileSync(path.join(srcDir, "source.jpg"), jpeg);

    const result = await installYahooAuctionFaces({
      packRoot,
      curatedRoot,
      force: true,
    });
    expect(result.written).toContain("ni0019/ja");
    expect(result.written).not.toContain("ni0003/ja");
    const dest = path.join(
      packRoot,
      "cards",
      "ninja",
      "ni0019",
      "ja",
      "art.yahoo.jpg",
    );
    expect(readFileSync(dest).equals(jpeg)).toBe(true);
    const decision = JSON.parse(
      readFileSync(
        path.join(
          packRoot,
          "cards",
          "ninja",
          "ni0019",
          "ja",
          NARUTO_FACE_DECISION_FILE,
        ),
        "utf8",
      ),
    ) as { art: string };
    expect(decision.art).toBe("art.yahoo.jpg");
  });
});
