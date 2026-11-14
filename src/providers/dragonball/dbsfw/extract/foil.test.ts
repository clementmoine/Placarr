import { describe, expect, it } from "vitest";

import { runDbsFwFoilExtract } from "./foil";

describe("runDbsFwFoilExtract", () => {
  it("soft-skips when no CDN staging and no override bundles", async () => {
    const result = await runDbsFwFoilExtract({
      bundlesDir: "/tmp/placarr-no-fw-client-bundles",
      skipCdn: true,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-client-bundles");
    expect(result.shaders).toBeUndefined();
  });
});
