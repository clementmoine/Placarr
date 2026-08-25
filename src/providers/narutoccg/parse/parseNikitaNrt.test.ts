import { describe, expect, it } from "vitest";

import ledger from "../curated/sources/nikita-nrt.json";
import {
  nikitaNrtFaceUrl,
  nikitaNrtFileToDiskId,
  nikitaNrtVolumeSetCode,
  parseNikitaNrtImgList,
} from "./parseNikitaNrt";

const FIXTURE = `
<div style="font-size:14pt;font-weight:bold;border-bottom:double 5px lightblue;">巻ノ壱</div>
<div id="img"><img src="/img/card/nrt/N-001.jpg"/><img src="/img/card/nrt/N-001_2.jpg"/>
<img src="/img/card/nrt/J-002.jpg"/><img src="/img/card/nrt/S-003.jpg"/>
<img src="/img/card/nrt/I-002.jpg"/><img src="/img/card/nrt/PRN-006.jpg"/>
<img src="/img/card/nrt/PRS-003.jpg"/><img src="/img/card/nrt/K-007.jpg"/>
<img src="/img/card/nrt/back.jpg"/></div>
<div style="font-size:14pt;">巻ノ十三 両雄激突！終末の谷編</div>
<div id="img"><img src="/img/card/nrt/N-384.jpg"/></div>
`;

describe("nikita nrt keys", () => {
  it("maps JP Carddass prefixes, never EN CCG n001", () => {
    expect(nikitaNrtFileToDiskId("N-001.jpg")).toEqual({
      number: "ni0001",
      nikitaKey: "N-001",
      variant: 0,
    });
    expect(nikitaNrtFileToDiskId("J-002.jpg")?.number).toBe("te0002");
    expect(nikitaNrtFileToDiskId("S-003.jpg")?.number).toBe("ta0003");
    expect(nikitaNrtFileToDiskId("I-002.jpg")?.number).toBe("cl0002");
    expect(nikitaNrtFileToDiskId("PRN-006.jpg")?.number).toBe("prni0006");
    expect(nikitaNrtFileToDiskId("PRS-003.jpg")?.number).toBe("prta0003");
    // 騎士 K used to be dropped. cardcheckbox prints 騎-1〜6 / 騎-7〜8, so it
    // is a real number and the site's single K face maps like any other.
    expect(nikitaNrtFileToDiskId("K-007.jpg")?.number).toBe("ki0007");
    expect(nikitaNrtFileToDiskId("N-001_2.jpg")?.variant).toBe(2);
    expect(nikitaNrtFaceUrl("/img/card/nrt/N-001.jpg")).toBe(
      "https://tcg-db.nikita.jp/img/card/nrt/N-001.jpg",
    );
  });

  it("reads 巻ノ headers as maki sets", () => {
    expect(nikitaNrtVolumeSetCode("巻ノ壱")).toBe("maki1");
    expect(nikitaNrtVolumeSetCode("巻ノ十三 両雄激突！終末の谷編")).toBe(
      "maki13",
    );
  });
});

describe("parseNikitaNrtImgList", () => {
  it("keeps the unsuffixed face and the 騎 number, skips the pack back", () => {
    const rows = parseNikitaNrtImgList(FIXTURE);
    expect(rows.map((r) => r.number)).toEqual([
      "cl0002",
      "ki0007",
      "ni0001",
      "ni0384",
      "prni0006",
      "prta0003",
      "ta0003",
      "te0002",
    ]);
    expect(rows.some((r) => r.number === "back")).toBe(false);
    expect(rows.find((r) => r.number === "ni0001")).toMatchObject({
      variant: 0,
      setCode: "maki1",
      imagePath: "/img/card/nrt/N-001.jpg",
    });
    expect(rows.find((r) => r.number === "ni0384")?.setCode).toBe("maki13");
  });
});

describe("nikita-nrt ledger", () => {
  it("ingests JP faces onto ni, not EN n", () => {
    expect(ledger.ingest).toBe("faces");
    expect(ledger.line).toBe("carddass-jp");
    expect(ledger.not).toContain("en-ccg");
    expect(ledger.not).toContain("n001");
    expect(ledger.prefixes.N).toBe("ni");
  });
});
