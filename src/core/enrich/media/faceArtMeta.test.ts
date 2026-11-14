import { describe, expect, it } from "vitest";
import {
  faceArtKindQuality,
  resolveDiskFaceAttachmentMeta,
  resolveFaceArtMetaForDig,
  stampFaceArtMetaFromBasename,
} from "./faceArtMeta";

describe("stampFaceArtMetaFromBasename", () => {
  it.each([
    ["art.corrected.webp", "corrected", false],
    ["art.reconstructed.png", "reconstructed", false],
    ["art.sample.jpg", "sample", true],
    ["art.official.webp", "official", false],
    ["art.coleka.webp", "dump", false],
    ["demo-plate.png", "dump", true],
  ] as const)("%s → %s watermarked=%s", (file, kind, watermarked) => {
    expect(stampFaceArtMetaFromBasename(file)).toEqual({
      artKind: kind,
      watermarked,
    });
  });
});

describe("faceArtKindQuality", () => {
  it("orders corrected > reconstructed > dump > sample", () => {
    expect(faceArtKindQuality("corrected")).toBeGreaterThan(
      faceArtKindQuality("reconstructed"),
    );
    expect(faceArtKindQuality("reconstructed")).toBeGreaterThan(
      faceArtKindQuality("dump"),
    );
    expect(faceArtKindQuality("dump")).toBeGreaterThan(
      faceArtKindQuality("sample"),
    );
  });
});

describe("resolveFaceArtMetaForDig", () => {
  it("prefers explicit dig observations over basename", () => {
    expect(
      resolveFaceArtMetaForDig({
        artFile: "art.coleka.webp",
        artKind: "sample",
        watermarked: true,
      }),
    ).toEqual({ artKind: "sample", watermarked: true });
  });

  it("fills gaps from basename when dig omits fields", () => {
    expect(
      resolveFaceArtMetaForDig({ artFile: "art.corrected.jpg" }),
    ).toEqual({ artKind: "corrected", watermarked: false });
  });
});

describe("resolveDiskFaceAttachmentMeta", () => {
  it("applies print_assets stamps only for the indexed winner", () => {
    expect(
      resolveDiskFaceAttachmentMeta({
        artFile: "art.coleka.webp",
        isIndexedWinner: true,
        winnerArtKind: "sample",
        winnerWatermarked: 1,
      }),
    ).toEqual({ artKind: "sample", watermarked: true });
    expect(
      resolveDiskFaceAttachmentMeta({
        artFile: "art.coleka.webp",
        isIndexedWinner: false,
        winnerArtKind: "sample",
        winnerWatermarked: 1,
      }),
    ).toEqual({ artKind: "dump", watermarked: false });
  });
});
