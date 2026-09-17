import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { NARUTO_FACE_DECISION_FILE } from "../faceChoice";
import { installMercariFaces } from "./installMercariFaces";

const dirs: string[] = [];

function tmp(): string {
  const dir = path.join(
    os.tmpdir(),
    `naruto-mercari-${Math.random().toString(16).slice(2)}`,
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

describe("installMercariFaces", () => {
  it("fetches mercdn url as art.mercari for 巻ノ壱 忍-3", async () => {
    const packRoot = tmp();
    const jpeg = await sharp({
      create: {
        width: 40,
        height: 56,
        channels: 3,
        background: { r: 220, g: 80, b: 120 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await installMercariFaces({
      packRoot,
      force: true,
      fetchImage: async (url) =>
        url.includes("m63902869042") ? jpeg : null,
    });
    expect(result.written).toContain("ni0003/ja");
    const dest = path.join(
      packRoot,
      "cards",
      "ninja",
      "ni0003",
      "ja",
      "art.mercari.jpg",
    );
    expect(readFileSync(dest).equals(jpeg)).toBe(true);
    const decision = JSON.parse(
      readFileSync(
        path.join(
          packRoot,
          "cards",
          "ninja",
          "ni0003",
          "ja",
          NARUTO_FACE_DECISION_FILE,
        ),
        "utf8",
      ),
    ) as { art: string };
    expect(decision.art).toBe("art.mercari.jpg");
  });
});
