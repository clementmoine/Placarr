import { describe, expect, it } from "vitest";

import {
  canonicalTcgdexSetId,
  normalizeTcgdexLocalId,
  tcgdexApiCardIdCandidates,
  tcgdexApiSetId,
} from "./localSetIds";

describe("canonicalTcgdexSetId", () => {
  it("remaps anniversary API ids onto the ME block sequence", () => {
    expect(canonicalTcgdexSetId("30th")).toBe("me05.5");
    expect(canonicalTcgdexSetId("30TH-C")).toBe("me05.5c");
    expect(canonicalTcgdexSetId("me05.5")).toBe("me05.5");
    expect(canonicalTcgdexSetId("sv08")).toBe("sv08");
  });
});

describe("tcgdexApiSetId", () => {
  it("round-trips remapped ids back to the API form", () => {
    expect(tcgdexApiSetId("me05.5")).toBe("30th");
    expect(tcgdexApiSetId("me05.5c")).toBe("30th-c");
    expect(tcgdexApiSetId("30th")).toBe("30th");
    expect(tcgdexApiSetId("sv08")).toBe("sv08");
  });
});

describe("tcgdexApiCardIdCandidates", () => {
  it("lists the remote card id first", () => {
    expect(tcgdexApiCardIdCandidates("me05.5", "023")).toEqual([
      "30th-023",
      "me05.5-023",
      "me05-5-023",
    ]);
  });

  it("adds TCGdex Unown ? encoding candidates", () => {
    expect(tcgdexApiCardIdCandidates("exu", "?")).toEqual([
      "exu-%3F",
      "exu-?",
    ]);
  });
});

describe("normalizeTcgdexLocalId", () => {
  it("decodes TCGdex Unown punctuation quirks", () => {
    expect(normalizeTcgdexLocalId("%3F")).toBe("?");
    expect(normalizeTcgdexLocalId("%21")).toBe("!");
    expect(normalizeTcgdexLocalId("A")).toBe("A");
  });
});
