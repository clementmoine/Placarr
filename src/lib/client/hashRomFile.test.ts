import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  crc32Hex,
  dumpTitleFromFileName,
  hashRomFile,
  md5Hex,
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

  it("hashRomFile returns sha1/md5/crc aligned with Node digests", async () => {
    const bytes = utf8("Tetris dump fixture");
    const hashes = await hashRomFile(bytes);
    expect(hashes.sha1).toBe(createHash("sha1").update(bytes).digest("hex"));
    expect(hashes.md5).toBe(createHash("md5").update(bytes).digest("hex"));
    expect(hashes.crc).toBe(crc32Hex(bytes));
  });

  it("dumpTitleFromFileName strips extension and path", () => {
    expect(dumpTitleFromFileName("Tetris (World).gb")).toBe("Tetris (World)");
    expect(dumpTitleFromFileName("/tmp/roms/Game.n64")).toBe("Game");
  });
});
