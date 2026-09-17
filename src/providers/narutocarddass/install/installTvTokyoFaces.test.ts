import { existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { NARUTO_FACE_DECISION_FILE } from "../faceChoice";
import { installTvTokyoFaces } from "./installTvTokyoFaces";

const dirs: string[] = [];

function tmp(): string {
  const dir = path.join(
    os.tmpdir(),
    `naruto-tvtokyo-${Math.random().toString(16).slice(2)}`,
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

describe("installTvTokyoFaces", () => {
  it("downloads and installs TV Tokyo art on disk", async () => {
    const packRoot = tmp();
    const fakeJpeg = await sharp({
      create: {
        width: 80,
        height: 117,
        channels: 3,
        background: { r: 255, g: 128, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    let fetched = 0;
    const result = await installTvTokyoFaces({
      packRoot,
      force: true,
      fetchImage: async (_url: string) => {
        fetched++;
        // Limit to 3 cards for test speed
        if (fetched > 3) return null;
        return fakeJpeg;
      },
    });

    expect(result.written.length).toBe(3);
    expect(result.written.some((k) => k.startsWith("ni0001/ja/"))).toBe(true);

    const installedFile = path.join(
      packRoot,
      "cards",
      "ninja",
      "ni0001",
      "ja",
      "art.tvtokyo.jpg",
    );
    expect(existsSync(installedFile)).toBe(true);

    const decisionFile = path.join(
      packRoot,
      "cards",
      "ninja",
      "ni0001",
      "ja",
      NARUTO_FACE_DECISION_FILE,
    );
    expect(existsSync(decisionFile)).toBe(true);
  }, 30_000);
});
