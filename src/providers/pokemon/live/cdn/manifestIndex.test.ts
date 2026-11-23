import { describe, expect, it } from "vitest";

import { splitByManifestIndex } from "./manifestIndex";

describe("splitByManifestIndex", () => {
  it("routes each bundle to the bucket its manifest lists, no probing", () => {
    // 2026-11-23 : me5-5 vit sous 20260915_1700 — les manifests publics le
    // disent ; la Sync le cherchait à tâtons dans 10101_0000.
    const bucketOf = new Map([
      ["me5_fr_001", "10101_0000"],
      ["me5-5_fr_001", "20260915_1700"],
      ["me6_fr_001", "20261105_1700"],
    ]);
    const out = splitByManifestIndex(
      ["me5_fr_001", "ME5-5_FR_001", "me6_fr_001", "bw8_fr_999"],
      bucketOf,
    );
    expect(out.located).toEqual(["me5_fr_001", "ME5-5_FR_001", "me6_fr_001"]);
    // Listed nowhere: honest miss, not worth a HEAD per bucket.
    expect(out.absent).toEqual(["bw8_fr_999"]);
  });
});
