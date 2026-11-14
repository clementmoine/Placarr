import { describe, expect, it } from "vitest";

import { orderManifestForPrefetch } from "@/core/identify/clientPackManifest";

describe("orderManifestForPrefetch", () => {
  it("streams the cheapest shards first so small packs land while big ones download", () => {
    const ordered = orderManifestForPrefetch([
      { packId: "yugioh", bytesF16: 56_000_000 },
      { packId: "lorcana", bytesF16: 5_400_000 },
      { packId: "bleach/scb", bytesF16: 120_000 },
      { packId: "pokemon", bytesF16: 22_500_000 },
    ]);
    expect(ordered.map((p) => p.packId)).toEqual([
      "bleach/scb",
      "lorcana",
      "pokemon",
      "yugioh",
    ]);
  });
});
