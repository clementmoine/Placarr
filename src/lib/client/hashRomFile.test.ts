import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  crc32Hex,
  dumpTitleFromFileName,
  formatRomHashSizeMiB,
  hashRomFile,
  md5Hex,
  ROM_HASH_SOFT_WARN_BYTES,
  romHashProgressPercent,
  sha1Hex,
  shouldWarnRomHashSize,
} from "./hashRomFile";

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("hashRomFile", () => {
  it("CRC32 matches the classic '123456789' vector", () => {
    expect(crc32Hex(utf8("123456789"))).toBe("cbf43926");
  });

  it("MD5 matches Node createHash for empty and abc", () => {
    expect(md5Hex(utf8(""))).toBe(
      createHash("md5").update("").digest("hex"),
    );
    expect(md5Hex(utf8("abc"))).toBe(
      createHash("md5").update("abc").digest("hex"),
    );
  });

  it("SHA-1 matches Node createHash for abc", () => {
    expect(sha1Hex(utf8("abc"))).toBe(
      createHash("sha1").update("abc").digest("hex"),
    );
  });

  it("hashRomFile returns sha1/md5/crc aligned with Node digests", async () => {
    const bytes = utf8("Tetris dump fixture");
    const hashes = await hashRomFile(bytes);
    expect(hashes.sha1).toBe(createHash("sha1").update(bytes).digest("hex"));
    expect(hashes.md5).toBe(createHash("md5").update(bytes).digest("hex"));
    expect(hashes.crc).toBe(crc32Hex(bytes));
  });

  it("streams Blob slices with tiny chunks and matches one-shot digests", async () => {
    const bytes = utf8("0123456789abcdef".repeat(20));
    const blob = new Blob([
      bytes.subarray(0, 7),
      bytes.subarray(7, 40),
      bytes.subarray(40),
    ]);
    const streamed = await hashRomFile(blob, { chunkBytes: 5 });
    expect(streamed.sha1).toBe(createHash("sha1").update(bytes).digest("hex"));
    expect(streamed.md5).toBe(createHash("md5").update(bytes).digest("hex"));
    expect(streamed.crc).toBe(crc32Hex(bytes));
  });

  it("reports progress from 0 to complete while streaming", async () => {
    const bytes = utf8("0123456789abcdef".repeat(8));
    const ratios: number[] = [];
    await hashRomFile(new Blob([bytes]), {
      chunkBytes: 16,
      onProgress: (progress) => {
        ratios.push(progress.ratio);
        expect(progress.totalBytes).toBe(bytes.byteLength);
        expect(progress.bytesRead).toBeLessThanOrEqual(progress.totalBytes);
      },
    });
    expect(ratios[0]).toBe(0);
    expect(ratios.at(-1)).toBe(1);
    expect(ratios.length).toBeGreaterThan(2);
  });

  it("maps progress ratio to whole percent for UI copy", () => {
    expect(romHashProgressPercent(0)).toBe(0);
    expect(romHashProgressPercent(0.456)).toBe(45);
    expect(romHashProgressPercent(1)).toBe(100);
  });

  it("dumpTitleFromFileName strips extension and path", () => {
    expect(dumpTitleFromFileName("Tetris (World).gb")).toBe("Tetris (World)");
    expect(dumpTitleFromFileName("/tmp/roms/Game.n64")).toBe("Game");
  });

  it("soft-warns at 256 MiB and formats size for toast copy", () => {
    expect(shouldWarnRomHashSize(ROM_HASH_SOFT_WARN_BYTES - 1)).toBe(false);
    expect(shouldWarnRomHashSize(ROM_HASH_SOFT_WARN_BYTES)).toBe(true);
    expect(formatRomHashSizeMiB(ROM_HASH_SOFT_WARN_BYTES)).toBe("256");
    expect(formatRomHashSizeMiB(ROM_HASH_SOFT_WARN_BYTES * 2)).toBe("512");
  });
});
