import { describe, expect, it } from "vitest";

import {
  aliasesExcludingTitle,
  collectMergedSearchAliases,
  promoteTitleKeepingAliases,
} from "@/lib/metadata/aliases";

describe("metadataAliases", () => {
  it("drops the promoted title from aliases", () => {
    expect(
      promoteTitleKeepingAliases(
        { title: "Naruto Tome 01", aliases: ["Naruto 1"] },
        "Naruto Tome 001",
      ),
    ).toEqual(["Naruto Tome 01", "Naruto 1"]);
  });

  it("returns undefined when no aliases remain", () => {
    expect(aliasesExcludingTitle("Naruto", "Naruto")).toBeUndefined();
  });

  it("collecte les titres provider + regionalTitles + facts aliases", () => {
    expect(
      collectMergedSearchAliases(
        [
          {
            title: "L'Attaque des Titans n°1",
            regionalTitles: [{ text: "L'Attaque des Titans n°1" }],
          },
          {
            title: "Shingeki no Kyojin",
            aliases: ["Attack on Titan"],
          },
        ],
        "L'Attaque des Titans n°1",
      ),
    ).toEqual(["Shingeki no Kyojin", "Attack on Titan"]);
  });
});
