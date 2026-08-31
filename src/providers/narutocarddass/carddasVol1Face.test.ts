import { describe, expect, it } from "vitest";

import {
  carddasJpVol1FaceOriginalUrls,
  carddasJpVol1FaceStem,
  carddasJpVol1FaceTargets,
  carddasJpVolumeFaceStem,
  waybackImageUrl,
} from "./carddasVol1Face";

describe("carddasJpVol1FaceStem", () => {
  it.each([
    ["忍-3", "shinobi-003_1"],
    ["術-15", "jutsu-015_1"],
    ["作-10", "saku-010_1"],
    ["依-43", "irai-043_1"],
    ["PR忍-1", null],
  ] as const)("maps %s", (printed, stem) => {
    expect(carddasJpVol1FaceStem(printed)).toBe(stem);
  });
});

describe("carddasJpVolumeFaceStem", () => {
  it.each([
    ["忍-146", 7, "shinobi-146_7"],
    ["術-348", 17, "jutsu-348_17"],
    ["作-332", 17, "saku-332_17"],
  ] as const)("maps %s vol %s", (printed, volume, stem) => {
    expect(carddasJpVolumeFaceStem(printed, volume)).toBe(stem);
  });
});

describe("carddasJpVol1FaceOriginalUrls", () => {
  it("prefers cardlist/card_img on carddas.com", () => {
    expect(carddasJpVol1FaceOriginalUrls("shinobi-003_1")[0]).toBe(
      "http://www.carddas.com/naruto/cardlist/card_img/shinobi-003_1.gif",
    );
  });

  it("builds Wayback image URLs", () => {
    expect(
      waybackImageUrl(
        "20071224051112",
        "http://www.carddas.com/naruto/cardlist/card_img/shinobi-003_1.gif",
      ),
    ).toBe(
      "https://web.archive.org/web/20071224051112im_/http://www.carddas.com/naruto/cardlist/card_img/shinobi-003_1.gif",
    );
  });
});

describe("carddasJpVol1FaceTargets", () => {
  it("lists 70 maki1 stems including ni0003", () => {
    const targets = carddasJpVol1FaceTargets();
    expect(targets).toHaveLength(70);
    expect(targets.find((t) => t.number === "ni0003")).toMatchObject({
      printed: "忍-3",
      stem: "shinobi-003_1",
    });
  });
});
