import { describe, expect, it } from "vitest";

import {
  isShelfTypeComingSoon,
  isShelfTypeReady,
  shelfTypeReadiness,
} from "@/lib/shelfTypeReadiness";

describe("shelfTypeReadiness", () => {
  it("marks every type with a working identify path as ready", () => {
    for (const type of [
      "games",
      "movies",
      "musics",
      "books",
      "boardgames",
      "hardware",
      // Cards resolve by print identity instead of a barcode.
      "tcg",
      // LEGO / toys — Brickset (EAN) + Rebrickable (set_num).
      "toys",
    ]) {
      expect(shelfTypeReadiness(type)).toBe("ready");
      expect(isShelfTypeReady(type)).toBe(true);
      expect(isShelfTypeComingSoon(type)).toBe(false);
    }
  });
});
