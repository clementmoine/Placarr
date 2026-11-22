import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadLiveSets, writeReprintMetaFile } from "./reprintMeta";

describe("reprintMeta", () => {
  it("écrit l'offset d'un split *sv dont seul le parent est dans le dump Live", async () => {
    const out = path.join(
      mkdtempSync(path.join(tmpdir(), "reprint-")),
      "reprintMeta.json",
    );
    const liveBundles = loadLiveSets({
      "swsh4-5_fr_001": {},
      "swsh4-5_fr_002": {},
      sv1_fr_001: {},
    });
    expect(liveBundles.get("swsh4-5")).toBe(2);
    const totals: Record<string, number> = { "swsh4.5": 73, "swsh4.5sv": 122 };
    const n = await writeReprintMetaFile({
      tcgdexIds: ["swsh4.5sv", "sv01"],
      liveBundles,
      outPath: out,
      fetchDetail: async (_lang, id) =>
        totals[id] ? { id, cardTotal: totals[id]! } : null,
    });
    expect(n).toBe(1);
    const file = JSON.parse(readFileSync(out, "utf8"));
    expect(file.byTcgdexSet["swsh4.5sv"]).toEqual({
      parentTcgdex: "swsh4.5",
      parentLive: "swsh4-5",
      svOffset: 73,
      parentCardTotal: 73,
      vaultCardTotal: 122,
    });
  });
});
