import { describe, expect, it } from "vitest";

import { priceProbeContext } from "@/providers/shared/createPrintKeyPriceModule";

import { opemarketModule } from "./index";

describe("opemarketModule info", () => {
  it("is a scrape-cache EUR reference for OPTCG", () => {
    expect(opemarketModule.info.id).toBe("opemarket");
    expect(opemarketModule.info.types).toContain("tcg");
    expect(opemarketModule.info.capabilities).toContain("price");
    expect(opemarketModule.info.referencePriceSource).toBe(true);
    expect(opemarketModule.info.evidenceOnlyPriceRefresh).toBe(true);
    expect(opemarketModule.info.supplyMode).toBe("scrape_cache");
  });
});

describe("opemarketModule.refreshBarcodePriceOffers", () => {
  it("returns empty under evidenceOnly without a warm index", async () => {
    const offers = await opemarketModule.refreshBarcodePriceOffers!({
      ...priceProbeContext({
        printKey: "onepiece:op17-001",
        name: "Edward Newgate",
      }),
      evidenceOnly: true,
    });
    expect(offers).toEqual([]);
  });
});
