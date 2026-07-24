import { describe, expect, it } from "vitest";

import { parseNameList } from "./parseNameList";

describe("parseNameList", () => {
  it("splits lines and deduplicates case-insensitively", () => {
    expect(parseNameList("Naruto n°01\nOne Piece n°02\nNaruto n°01")).toEqual([
      "Naruto n°01",
      "One Piece n°02",
    ]);
  });

  it("ignores blank lines", () => {
    expect(parseNameList("\n  \nDragon Ball Z\n")).toEqual(["Dragon Ball Z"]);
  });
});
