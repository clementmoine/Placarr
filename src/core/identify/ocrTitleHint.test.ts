import { describe, expect, it } from "vitest";

import {
  ocrTitleTokens,
  rerankMatchesByTitleTokens,
  titleTokenHits,
} from "@/core/identify/ocrTitleHint";

describe("ocrTitleTokens", () => {
  it("keeps the printed name, drops stop words and bare digits", () => {
    expect(ocrTitleTokens("Ariel — Chanteuse exceptionnelle 2")).toEqual([
      "ariel",
      "chanteuse",
      "exceptionnelle",
    ]);
  });

  it("returns empty on collector-only noise", () => {
    expect(ocrTitleTokens("66/204 • FR • 3")).toEqual([]);
  });
});

describe("rerankMatchesByTitleTokens", () => {
  const titles: Record<string, string> = {
    "lorcana:1-1": "Ariel, Chanteuse exceptionnelle",
    "lorcana:9-13": "Mickey, Brave Little Tailor",
  };

  it("promotes the row whose title matches the OCR name", () => {
    const out = rerankMatchesByTitleTokens(
      [
        { printKey: "lorcana:9-13", distance: 80 },
        { printKey: "lorcana:1-1", distance: 90 },
      ],
      ocrTitleTokens("Ariel Chanteuse"),
      (key) => titles[key],
    );
    expect(out[0]?.printKey).toBe("lorcana:1-1");
  });

  it("does not invent a printKey that was not in the shortlist", () => {
    const out = rerankMatchesByTitleTokens(
      [{ printKey: "lorcana:9-13", distance: 80 }],
      ocrTitleTokens("Ariel Chanteuse"),
      (key) => titles[key],
    );
    expect(out).toEqual([{ printKey: "lorcana:9-13", distance: 80 }]);
  });

  it("counts overlapping tokens", () => {
    expect(titleTokenHits("Ariel, Chanteuse exceptionnelle", ["ariel"])).toBe(
      1,
    );
  });
});
