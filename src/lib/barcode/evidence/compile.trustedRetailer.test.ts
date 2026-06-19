import { describe, expect, it } from "vitest";

import { buildProductEvidence } from "./parse";

describe("buildProductEvidence — trusted retailers", () => {
  it("marque Philibert comme revendeur de confiance", () => {
    const evidence = buildProductEvidence("Philibert", {
      name: "Unlock! Short Adventures : Red Mask",
      coverUrl: "https://cdn1.philibertnet.com/example.jpg",
    });

    expect(evidence).toMatchObject({
      isCanonical: false,
      isTrustedRetailer: true,
      priority: 1,
    });
  });

  it("laisse PicClick en marketplace", () => {
    const evidence = buildProductEvidence("PicClick", {
      name: "Unlock! Short Adventures - Red Mask",
    });

    expect(evidence).toMatchObject({
      isCanonical: false,
      isTrustedRetailer: false,
      priority: 0,
    });
  });
});
