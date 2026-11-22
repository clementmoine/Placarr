import { describe, expect, it, vi } from "vitest";

const fetchStoreApksForPack = vi.hoisted(() =>
  vi.fn(async () => ({ status: "up-to-date" as const, versionCode: 42 })),
);
vi.mock("@/lib/admin/apkStoreFetch", () => ({ fetchStoreApksForPack }));
const ensureFusionWorldClientFromCdn = vi.hoisted(() =>
  vi.fn(async () => ({ skipped: false, stamp: { version: "98" } })),
);
vi.mock("@/providers/dragonball/dbsfw/cdn/ensureClient", () => ({
  ensureFusionWorldClientFromCdn,
}));

import { discoverCatalogProviderModules } from "@/core/catalog/catalog";

import { ensurePackClient } from "./catalogueClient";
import { CATALOGUE_PACKS } from "./cataloguePacks";

function moduleForPack(packId: string) {
  return discoverCatalogProviderModules().find(
    (mdl) => mdl.catalog?.dataPack === packId && mdl.catalog.ensureClient,
  );
}

describe("ADR-026 — client du jeu déclaré par le pack", () => {
  it("tout pack à APK du store déclare ensureClient", () => {
    const apkPacks = CATALOGUE_PACKS.filter((p) => p.androidPackageId);
    expect(apkPacks.length).toBeGreaterThan(0);
    for (const pack of apkPacks) {
      expect(moduleForPack(pack.id)?.catalog?.ensureClient, pack.id).toBeTypeOf(
        "function",
      );
    }
  });

  it("APK : sonde le store du pack et rend la version", async () => {
    fetchStoreApksForPack.mockClear();
    await expect(ensurePackClient("lorcana")).resolves.toEqual({
      status: "up-to-date",
      version: "42",
    });
    expect(fetchStoreApksForPack).toHaveBeenCalledWith(
      "lorcana",
      expect.any(Object),
    );
  });

  it("Fusion World : client CDN par la même étape", async () => {
    await expect(ensurePackClient("dragonball/fw")).resolves.toEqual({
      status: "updated",
      version: "98",
    });
    expect(ensureFusionWorldClientFromCdn).toHaveBeenCalled();
  });

  it("les autres packs ne sondent rien", async () => {
    fetchStoreApksForPack.mockClear();
    await expect(ensurePackClient("naruto/carddass")).resolves.toEqual({
      status: "skipped",
    });
    await expect(ensurePackClient(undefined)).resolves.toEqual({
      status: "skipped",
    });
    expect(fetchStoreApksForPack).not.toHaveBeenCalled();
  });
});
