import { describe, expect, it } from "vitest";

import { parseCarddasJpAssetPath } from "./parseCarddasJpAsset";

describe("parseCarddasJpAssetPath", () => {
  it("parses special gifs into spc print identity", () => {
    expect(
      parseCarddasJpAssetPath(
        "http://www.carddas.com/naruto/cardlist/card_img/jutsu-027_spc2.gif",
      ),
    ).toEqual({
      set: "spc",
      stem: "jutsu-027_spc2",
      kind: "jutsu",
      number: "jutsu027spc2",
      cardId: "jutsu027spc2",
      printKey: "naruto:spc-jutsu027spc2",
      ext: ".gif",
    });
    expect(
      parseCarddasJpAssetPath(
        "http://www.carddas.com/naruto/cardlist/card_img/irai-043_spc2.gif",
      ),
    ).toMatchObject({
      kind: "irai",
      set: "spc",
      number: "irai043spc2",
    });
  });

  it("skips chrome head.gif", () => {
    expect(
      parseCarddasJpAssetPath(
        "http://www.carddas.com/naruto/cardlist/card_img/head.gif",
      ),
    ).toBeNull();
  });
});
