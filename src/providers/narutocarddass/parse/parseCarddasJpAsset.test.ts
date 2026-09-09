import { describe, expect, it } from "vitest";

import {
  parseCarddasJpAssetPath,
  carddasJpStagingFaceToDiskId,
  carddasJpStagingFaceInstallTarget,
} from "./parseCarddasJpAsset";

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

describe("carddasJpStagingFaceToDiskId", () => {
  it("maps sparse official GIFs onto collector disk ids", () => {
    expect(carddasJpStagingFaceToDiskId("shinobi-393_spc2.gif")).toBe("ni0393");
    expect(carddasJpStagingFaceToDiskId("shinobi-003_1.gif")).toBe("ni0003");
    expect(carddasJpStagingFaceToDiskId("jutsu-015_1.gif")).toBe("te0015");
    expect(carddasJpStagingFaceToDiskId("shinobi-146_7.gif")).toBe("ni0146");
    expect(carddasJpStagingFaceToDiskId("jutsu-348_17.gif")).toBe("te0348");
    expect(carddasJpStagingFaceToDiskId("shinobi-352.gif")).toBe("ni0352");
    expect(carddasJpStagingFaceToDiskId("shinobi_372_16.gif")).toBe("ni0372");
    expect(carddasJpStagingFaceToDiskId("jutsu-027_spc2.gif")).toBe("te0027");
    expect(carddasJpStagingFaceToDiskId("saku-010_spc2.gif")).toBe("ta0010");
    expect(carddasJpStagingFaceToDiskId("irai-043_spc2.gif")).toBe("cl0043");
    expect(carddasJpStagingFaceToDiskId("ju-062_d3.gif")).toBe("mju0062");
    expect(carddasJpStagingFaceToDiskId("head.gif")).toBeNull();
    expect(carddasJpStagingFaceToDiskId("001.gif")).toBeNull();
    expect(carddasJpStagingFaceToDiskId("shinobi-203.jpg")).toBeNull();
    expect(carddasJpStagingFaceToDiskId("jutsu-169_yuki.gif")).toBeNull();
  });

  it("installs volume dumps on the official cardlist, skips sequential /card/ ids", () => {
    expect(carddasJpStagingFaceInstallTarget("shinobi-146_7.gif")).toBe(
      "ni0146",
    );
    expect(carddasJpStagingFaceInstallTarget("shinobi-352.gif")).toBe("ni0352");
    expect(carddasJpStagingFaceInstallTarget("shinobi-393_spc2.gif")).toBe(
      "ni0393",
    );
    expect(carddasJpStagingFaceInstallTarget("saku-214.gif")).toBeNull();
    expect(carddasJpStagingFaceInstallTarget("shinobi-314.gif")).toBeNull();
  });
});
