import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { installCardFace } from "./faceInstall";

function tmpDir(): string {
  return mkdtempSync(path.join(tmpdir(), "face-install-"));
}

describe("installCardFace", () => {
  it("réutilise uniquement artName déjà en place — pas un autre art.*", async () => {
    const destDir = tmpDir();
    writeFileSync(path.join(destDir, "art.webp"), "existing-plain");
    let fetched = 0;
    const installed = await installCardFace({
      destDir,
      artName: "art.scanflip.webp",
      url: "https://example.test/face.jpg",
      fetchImage: async () => {
        fetched += 1;
        return Buffer.from("scanflip-bytes");
      },
    });
    expect(fetched).toBe(1);
    expect(installed).toEqual({ art: "art.scanflip.webp", downloaded: true });
    expect(readFileSync(path.join(destDir, "art.scanflip.webp"), "utf8")).toBe(
      "scanflip-bytes",
    );
    expect(readFileSync(path.join(destDir, "art.webp"), "utf8")).toBe(
      "existing-plain",
    );
  });

  it("écrit les octets bruts quand aucun art n'existe", async () => {
    const destDir = tmpDir();
    const installed = await installCardFace({
      destDir,
      artName: "art.nikita.jpg",
      url: "https://example.test/face.jpg",
      fetchImage: async () => Buffer.from("face-bytes"),
    });
    expect(installed).toEqual({ art: "art.nikita.jpg", downloaded: true });
  });

  it("skip le fetch si artName est déjà là", async () => {
    const destDir = tmpDir();
    writeFileSync(path.join(destDir, "art.scanflip.webp"), "mine");
    const installed = await installCardFace({
      destDir,
      artName: "art.scanflip.webp",
      url: "https://example.test/face.jpg",
      fetchImage: async () => {
        throw new Error("must not fetch");
      },
    });
    expect(installed).toEqual({ art: "art.scanflip.webp", downloaded: false });
  });

  it("force le retéléchargement même si le fichier est là", async () => {
    const destDir = tmpDir();
    writeFileSync(path.join(destDir, "art.nikita.jpg"), "stale");
    let fetched = 0;
    const installed = await installCardFace({
      destDir,
      artName: "art.nikita.jpg",
      url: "https://example.test/face.jpg",
      force: true,
      fetchImage: async () => {
        fetched += 1;
        return Buffer.from("fresh");
      },
    });
    expect(fetched).toBe(1);
    expect(installed).toEqual({ art: "art.nikita.jpg", downloaded: true });
    expect(existsSync(path.join(destDir, "art.nikita.jpg"))).toBe(true);
  });

  it("rend null si le fetch échoue", async () => {
    const destDir = tmpDir();
    const installed = await installCardFace({
      destDir,
      artName: "art.jpg",
      url: "https://example.test/missing.jpg",
      fetchImage: async () => null,
    });
    expect(installed).toBeNull();
  });

  it("applique rotateDegrees sur un dump paysage scanné en portrait", async () => {
    const destDir = tmpDir();
    const sharp = (await import("sharp")).default;
    // 2×3 portrait → rotate 270 → 3×2 landscape
    const portrait = await sharp({
      create: {
        width: 2,
        height: 3,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();
    const installed = await installCardFace({
      destDir,
      artName: "art.nikita.jpg",
      url: "https://example.test/face.jpg",
      rotateDegrees: 270,
      fetchImage: async () => portrait,
    });
    expect(installed).toEqual({ art: "art.nikita.jpg", downloaded: true });
    const meta = await sharp(path.join(destDir, "art.nikita.jpg")).metadata();
    expect(meta.width).toBe(3);
    expect(meta.height).toBe(2);
  });
});
