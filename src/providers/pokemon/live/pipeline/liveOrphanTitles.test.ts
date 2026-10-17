import { describe, expect, it } from "vitest";

import {
  loadLiveOrphanTitles,
  resolveLiveOrphanIndexName,
  type LiveOrphanTitleRow,
} from "./liveOrphanTitles";

const SAMPLE: Readonly<Record<string, LiveOrphanTitleRow>> = {
  sm4_en_125: { en: "Basic {M} Energy", fr: "Énergie Métal" },
};

describe("resolveLiveOrphanIndexName", () => {
  it("attests the curated EN title for sm4_en_125", () => {
    expect(resolveLiveOrphanIndexName("sm4_en_125", SAMPLE)).toEqual({
      kind: "attested",
      name: "Basic {M} Energy",
    });
  });

  it("attests FR when the stem is French", () => {
    expect(resolveLiveOrphanIndexName("sm4_fr_125", SAMPLE)).toEqual({
      kind: "attested",
      name: "Énergie Métal",
    });
  });

  it("returns null for unknown stems", () => {
    expect(resolveLiveOrphanIndexName("sm4_en_124", SAMPLE)).toBeNull();
  });
});

describe("loadLiveOrphanTitles", () => {
  it("lit le ledger sous pokemon/live (pas pokemontcglive)", () => {
    const titles = loadLiveOrphanTitles();
    expect(titles.sm4_en_125?.en).toBe("Basic {M} Energy");
  });
});
