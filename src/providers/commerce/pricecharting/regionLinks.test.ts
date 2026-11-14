import { describe, expect, it } from "vitest";

import { buildPriceChartingRegionLinkFacts } from "./index";

describe("buildPriceChartingRegionLinkFacts", () => {
  it("emits a single PriceCharting chip when only one fiche exists", () => {
    expect(
      buildPriceChartingRegionLinkFacts({
        title: "Black Gamecube System",
        url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
      }),
    ).toEqual([
      {
        kind: "external-link",
        label: "PriceCharting",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
        source: "pricecharting",
        confidence: 0.7,
        priority: 44,
      },
    ]);
  });

  it("emits EUR + US chips when both regional fiches were resolved", () => {
    const facts = buildPriceChartingRegionLinkFacts({
      title: "Black Gamecube System",
      url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
      siblingUrl:
        "https://www.pricecharting.com/game/gamecube/black-gamecube-system",
    });

    expect(facts).toEqual([
      {
        kind: "external-link",
        label: "PriceCharting (EUR)",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/pal-gamecube/black-gamecube-system",
        source: "pricecharting",
        confidence: 0.7,
        priority: 44,
      },
      {
        kind: "external-link",
        label: "PriceCharting (US)",
        value: "Voir la fiche",
        url: "https://www.pricecharting.com/game/gamecube/black-gamecube-system",
        source: "pricecharting",
        confidence: 0.7,
        priority: 42,
      },
    ]);
  });
});
