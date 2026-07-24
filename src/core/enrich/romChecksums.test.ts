import { describe, expect, it } from "vitest";

import {
  mergeRomChecksums,
  normalizeRomChecksums,
  romChecksumsFromIdentifierFacts,
} from "./romChecksums";

describe("romChecksums", () => {
  it("normalizes hex and drops empty", () => {
    expect(
      normalizeRomChecksums({
        crc: "46DF91AD",
        md5: "  ",
        sha1: null,
      }),
    ).toEqual({ crc: "46df91ad", md5: undefined, sha1: undefined });
    expect(normalizeRomChecksums({})).toBeUndefined();
  });

  it("rehydrates CRC/MD5/SHA1 from identifier facts", () => {
    expect(
      romChecksumsFromIdentifierFacts([
        { kind: "identifier", label: "CRC", value: "46DF91AD" },
        { kind: "identifier", label: "SHA-1", value: "aabb" },
        { kind: "edition", label: "CRC", value: "ignored" },
        {
          kind: "external-link",
          label: "No-Intro",
          value: "Nintendo - Game Boy",
        },
      ]),
    ).toEqual({
      crc: "46df91ad",
      md5: undefined,
      sha1: "aabb",
    });
  });

  it("merges preferring first non-empty per algorithm", () => {
    expect(
      mergeRomChecksums(
        { crc: "11111111" },
        { crc: "22222222", md5: "abcd" },
        { sha1: "eeee" },
      ),
    ).toEqual({
      crc: "11111111",
      md5: "abcd",
      sha1: "eeee",
    });
  });
});
