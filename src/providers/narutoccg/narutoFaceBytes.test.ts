import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { NARUTO_FACE_DECISION_FILE } from "./faceChoice";
import {
  existingNarutoArtForSource,
  saveNarutoFace,
  writeNarutoArtFile,
} from "./narutoFaceBytes";

const dirs: string[] = [];

function tmp(): string {
  const dir = path.join(
    os.tmpdir(),
    `naruto-face-${Math.random().toString(16).slice(2)}`,
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

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 80, b: 20 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("saveNarutoFace", () => {
  it("writes art.<source> beside an unsourced art.jpg", async () => {
    const cardDir = tmp();
    writeFileSync(path.join(cardDir, "art.jpg"), await jpeg(10, 14));
    const result = await saveNarutoFace({
      cardDir,
      buf: await jpeg(80, 112),
      source: "suruga",
      lang: "ja",
    });
    expect(result).toBe("ok");
    expect(existsSync(path.join(cardDir, "art.jpg"))).toBe(true);
    expect(existsSync(path.join(cardDir, "art.suruga.jpg"))).toBe(true);
    expect(existingNarutoArtForSource(cardDir, "suruga")).toBe(
      "art.suruga.jpg",
    );
    expect(existingNarutoArtForSource(cardDir, "legacy")).toBe("art.jpg");
    const decision = JSON.parse(
      readFileSync(path.join(cardDir, NARUTO_FACE_DECISION_FILE), "utf8"),
    ) as { art?: string };
    expect(decision.art).toBe("art.suruga.jpg");
  });

  it("skips only when that source is already on disk", async () => {
    const cardDir = tmp();
    writeNarutoArtFile(cardDir, await jpeg(20, 28), "suruga");
    const result = await saveNarutoFace({
      cardDir,
      buf: await jpeg(90, 126),
      source: "suruga",
      lang: "ja",
    });
    expect(result).toBe("skip");
    const nikita = await saveNarutoFace({
      cardDir,
      buf: await jpeg(30, 42),
      source: "nikita",
      lang: "ja",
    });
    expect(nikita).toBe("ok");
    expect(existsSync(path.join(cardDir, "art.suruga.jpg"))).toBe(true);
    expect(existsSync(path.join(cardDir, "art.nikita.jpg"))).toBe(true);
  });

  it("keeps reconstructed above a larger dump", async () => {
    const cardDir = tmp();
    writeFileSync(
      path.join(cardDir, "art.reconstructed.png"),
      await jpeg(20, 28),
    );
    await saveNarutoFace({
      cardDir,
      buf: await jpeg(200, 280),
      source: "nikita",
      lang: "ja",
    });
    const decision = JSON.parse(
      readFileSync(path.join(cardDir, NARUTO_FACE_DECISION_FILE), "utf8"),
    ) as { art?: string };
    expect(decision.art).toBe("art.reconstructed.png");
  });

  it("keeps the official FR raw when Coleka is a larger photo", async () => {
    const cardDir = tmp();
    writeNarutoArtFile(cardDir, await jpeg(350, 496), "carddass");
    await saveNarutoFace({
      cardDir,
      buf: await jpeg(900, 1200),
      source: "coleka",
      lang: "fr",
    });
    const decision = JSON.parse(
      readFileSync(path.join(cardDir, NARUTO_FACE_DECISION_FILE), "utf8"),
    ) as { art?: string };
    expect(decision.art).toBe("art.carddass.jpg");
  });
});
