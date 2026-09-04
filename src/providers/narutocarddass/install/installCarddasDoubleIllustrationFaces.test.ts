import { describe, expect, it } from "vitest";

import ledger from "../curated/sources/carddas-jp-double-illustrations.json";
import { carddasDoubleGifBasename } from "../install/installCarddasDoubleIllustrationFaces";

describe("carddas double illustrations", () => {
  it("lists three GIF basenames recoverable from carddas staging", () => {
    expect(ledger.cards).toHaveLength(3);
    expect(ledger.cards.map((c) => c.number)).toEqual([
      "te0192",
      "te0348",
      "te0358",
    ]);
    expect(
      ledger.cards.map((c) => carddasDoubleGifBasename(c.gif)),
    ).toEqual([
      "jutsu-192_10.gif",
      "jutsu-348_17.gif",
      "jutsu-358_17.gif",
    ]);
  });
});
