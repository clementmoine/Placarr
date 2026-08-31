import { describe, expect, it } from "vitest";

import {
  discoverCatalogProviderModules,
  discoverProviderModules,
  materializeProviderInfo,
} from "@/core/catalog/catalog";

describe("provider supplyMode", () => {
  it("every registered module declares or materializes a supplyMode", () => {
    for (const mdl of discoverProviderModules()) {
      const info = materializeProviderInfo(mdl.info);
      expect(
        ["api_live", "scrape_cache", "local_catalog"],
        `${mdl.info.id} supplyMode`,
      ).toContain(info.supplyMode);
    }
  });
});

describe("provider catalog contract", () => {
  it("every module with catalog exposes dataPack, status, refresh", () => {
    const catalogModules = discoverCatalogProviderModules();
    expect(catalogModules.length).toBeGreaterThanOrEqual(5);
    for (const mdl of catalogModules) {
      expect(mdl.catalog?.dataPack, mdl.info.id).toBeTruthy();
      expect(typeof mdl.catalog?.status, mdl.info.id).toBe("function");
      expect(typeof mdl.catalog?.refresh, mdl.info.id).toBe("function");
    }
  });

  it("includes known local corpora by dataPack (not hard-coded id lists in core)", () => {
    const packs = new Set(
      discoverCatalogProviderModules().map((m) => m.catalog!.dataPack),
    );
    for (const pack of [
      "lorcana",
      "pokemon",
      "naruto/carddass",
      "dbs/cg",
      "dbs/fw",
      "launchbox",
      "icollect",
      "nointro",
    ]) {
      expect(packs.has(pack), pack).toBe(true);
    }
  });

  it("every local_catalog module that claims cover exposes createMetadataAdapter", () => {
    for (const mdl of discoverProviderModules()) {
      const info = materializeProviderInfo(mdl.info);
      if (info.supplyMode !== "local_catalog") continue;
      if (!info.capabilities?.includes("cover")) continue;
      expect(
        typeof mdl.createMetadataAdapter,
        `${mdl.info.id} must bridge print/corpus → enrich cover`,
      ).toBe("function");
    }
  });
});
