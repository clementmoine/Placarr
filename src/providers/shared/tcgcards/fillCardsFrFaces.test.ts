import { describe, expect, it } from "vitest";

import { cardsFrShopPrintKey } from "./cardsFrPrintRef";
import { fillOpecardsFaces } from "./fillCardsFrFaces";
import { tcgCardsSite } from "./sites";

describe("fillOpecardsFaces", () => {
  it("maps opecards host to onepiece pack / printGame", () => {
    expect(typeof fillOpecardsFaces).toBe("function");
    expect(tcgCardsSite("opecards").packId).toBe("onepiece");
    expect(tcgCardsSite("opecards").printGame).toBe("onepiece");
  });

  it("does not invent printKeys from shop tiles without a Bandai ref", () => {
    expect(
      cardsFrShopPrintKey({
        game: "onepiece",
        print: { slug: "luffy-random", ref: null, image: null },
      }),
    ).toBeNull();
  });
});
