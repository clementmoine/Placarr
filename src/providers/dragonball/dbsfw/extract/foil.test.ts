import { describe, expect, it } from "vitest";

import { runDbsFwFoilExtract } from "./foil";

describe("runDbsFwFoilExtract", () => {
  it("soft-skips when CDN staging is unavailable", async () => {
    const result = await runDbsFwFoilExtract({
      bundlesDir: "/tmp/placarr-no-fw-client-bundles",
      skipCdn: true,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-cdn-client");
    expect(result.shaders).toBeUndefined();
  });
});
