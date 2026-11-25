import { describe, expect, it } from "vitest";

import {
  PRODUCT_DETAIL_PROGRESS_EVERY,
  productDetailProgressLine,
} from "./scrapeProducts";

/*
  453 fiches lues sans une ligne dans le journal : six minutes de silence que
  l'admin prenait pour une Sync bloquée. Une ligne toutes les N fiches, et
  toujours la dernière.
*/
describe("productDetailProgressLine", () => {
  it("reports every N fiches and the last one", () => {
    const every = PRODUCT_DETAIL_PROGRESS_EVERY;
    expect(productDetailProgressLine(1, 453, 1)).toBeNull();
    expect(productDetailProgressLine(every, 453, every)).toBe(
      `fiches ${every}/453 (${every} GET)`,
    );
    expect(productDetailProgressLine(453, 453, 12)).toBe(
      "fiches 453/453 (12 GET)",
    );
  });

  it("stays quiet when there is nothing to read", () => {
    expect(productDetailProgressLine(0, 0, 0)).toBeNull();
  });
});
