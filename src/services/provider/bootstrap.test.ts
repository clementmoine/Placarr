import { describe, expect, it } from "vitest";

import {
  createMetadataAdapters,
  getMetadataProviderAdapter,
} from "@/services/provider/bootstrap";

const { PROVIDERS, PROVIDER_MODULES } = await import("@/services/provider/catalog");

describe("createMetadataAdapters", () => {
  it("creates one adapter per module that exports createMetadataAdapter", () => {
    const adapters = createMetadataAdapters();
    const expectedIds = PROVIDER_MODULES.flatMap((mdl) =>
      mdl.createMetadataAdapter ? [mdl.info.id] : [],
    ).sort();

    expect(adapters.map((adapter) => adapter.id).sort()).toEqual(expectedIds);
  });

  it("maps every adapter to a declared provider", () => {
    const adapters = createMetadataAdapters();

    for (const adapter of adapters) {
      const provider = PROVIDERS.find(
        (candidate) => candidate.id === adapter.id,
      );
      expect(provider).toBeDefined();
    }
  });

  it("reads metadata traits from module self-declaration (PrestaShop configs + modules)", () => {
    const chipweld = PROVIDERS.find((p) => p.id === "chipweld");
    const netgamesretro = PROVIDERS.find((p) => p.id === "netgamesretro");
    const chocobonplan = PROVIDERS.find((p) => p.id === "chocobonplan");
    const chasseauxlivres = PROVIDERS.find((p) => p.id === "chasseauxlivres");

    expect(chipweld?.isSecondary).toBe(true);
    expect(chipweld?.isRealBoxCover).toBe(true);
    expect(netgamesretro?.strictShelfPlatformCover).toBe(true);
    expect(netgamesretro?.retailCatalogImageTitles).toBe(true);
    expect(chocobonplan?.bookGallerySource).toBe(true);
    expect(chasseauxlivres?.bookGallerySource).toBe(true);
  });
});

describe("getMetadataProviderAdapter", () => {
  it("returns wrapped adapters from the live registry map", () => {
    const adapter = getMetadataProviderAdapter("tmdb");
    expect(adapter?.id).toBe("tmdb");
  });
});
