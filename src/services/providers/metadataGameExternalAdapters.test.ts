import { describe, expect, it } from "vitest";

import { PROVIDERS } from "@/services/providerRegistry";

import { gameExternalMetadataAdapters } from "./metadataGameExternalAdapters";

describe("gameExternalMetadataAdapters", () => {
  it("registers each adapter against a known game provider", () => {
    for (const adapter of gameExternalMetadataAdapters) {
      const provider = PROVIDERS.find((candidate) => candidate.id === adapter.id);
      expect(provider).toBeDefined();
      expect(provider?.types).toContain("games");
    }
  });

  it("keeps stable core game adapter ids", () => {
    expect(gameExternalMetadataAdapters.map((adapter) => adapter.id)).toEqual([
      "igdb",
      "howlongtobeat",
      "steam",
      "steamgriddb",
    ]);
  });
});
