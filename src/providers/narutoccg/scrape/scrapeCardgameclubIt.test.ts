import { describe, expect, it } from "vitest";

import {
  CARDGAMECLUB_IT_FACE_GIVE_UP_AFTER,
  cardgameclubItShouldAbortFaceDownloads,
} from "./scrapeCardgameclubIt";

describe("cardgameclubItShouldAbortFaceDownloads", () => {
  it("gives up after a few consecutive Magento JPEG misses", () => {
    expect(cardgameclubItShouldAbortFaceDownloads(0)).toBe(false);
    expect(cardgameclubItShouldAbortFaceDownloads(2)).toBe(false);
    expect(
      cardgameclubItShouldAbortFaceDownloads(
        CARDGAMECLUB_IT_FACE_GIVE_UP_AFTER,
      ),
    ).toBe(true);
  });
});
