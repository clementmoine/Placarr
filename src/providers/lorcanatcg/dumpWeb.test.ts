import { describe, expect, it } from "vitest";

import {
  discoverCssPaths,
  parseAllAssetStems,
  parseAssetRefs,
  stableName,
  unlistedFoilStemCandidates,
} from "./dumpWeb";

const SAMPLE_CSS = `
.Silver .foil-shine .foil-inner{background-image:url(/assets/silverc-B7Q2CuyS.jpg),url(/assets/satin-BFAj3gek.jpg)}
.Satin .foil-shine .foil-inner{background-image:url(/assets/satinc-_4HVyYlm.png),url(/assets/satin-BFAj3gek.jpg)}
.frame{background:url(/assets/frame-slice-D8pv6LjA.png)}
.NewFoil{background:url(/assets/brandnewfoil-AaBbCc12.webp)}
`;

describe("dumpWeb", () => {
  it("parseAssetRefs keeps foil stems only", () => {
    const refs = parseAssetRefs(SAMPLE_CSS);
    expect(refs.satin).toBe("/assets/satin-BFAj3gek.jpg");
    expect(refs.silverc).toBe("/assets/silverc-B7Q2CuyS.jpg");
    expect(refs.satinc).toBe("/assets/satinc-_4HVyYlm.png");
    expect(refs).not.toHaveProperty("frame");
    expect(refs).not.toHaveProperty("brandnewfoil");
  });

  it("parseAllAssetStems + unlistedFoilStemCandidates surface new site textures", () => {
    const all = parseAllAssetStems(SAMPLE_CSS);
    expect(all.frame).toBe("/assets/frame-slice-D8pv6LjA.png");
    expect(all.brandnewfoil).toBe("/assets/brandnewfoil-AaBbCc12.webp");
    expect(unlistedFoilStemCandidates(all)).toEqual(
      expect.arrayContaining(["brandnewfoil", "frame"]),
    );
  });

  it("stableName normalizes jpeg → jpg", () => {
    expect(stableName("satin", "jpg")).toBe("satin.jpg");
    expect(stableName("satinc", "JPEG")).toBe("satinc.jpg");
  });

  it("discoverCssPaths finds routes/index sheets", () => {
    const html =
      '<link rel="stylesheet" href="/assets/routes-DdJjns6d.css">';
    expect(discoverCssPaths(html)).toEqual(["/assets/routes-DdJjns6d.css"]);
  });
});
