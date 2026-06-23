import { describe, expect, it } from "vitest";

import { PROVIDER_MODULES } from "@/services/providerRegistry";

describe("game metadata provider modules", () => {
  const gameAdapterIds = PROVIDER_MODULES.flatMap((module) =>
    module.createMetadataAdapter && module.info.types.includes("games")
      ? [module.info.id]
      : [],
  );

  it("registers each game adapter against a known game provider", () => {
    for (const id of gameAdapterIds) {
      const provider = PROVIDER_MODULES.find((module) => module.info.id === id);
      expect(provider?.info.types).toContain("games");
    }
  });

  it("keeps stable core game adapter ids", () => {
    expect(gameAdapterIds.sort()).toEqual(
      [
        "achatmoinscher",
        "apriloshop",
        "coverproject",
        "howlongtobeat",
        "igdb",
        "launchbox",
        "pricecharting",
        "rawg",
        "screenscraper",
        "steam",
        "steamgriddb",
        "thegamesdb",
      ].sort(),
    );
  });
});
