import { describe, expect, it } from "vitest";

import { runDbsFwFoilExtract } from "./foil";

describe("runDbsFwFoilExtract", () => {
  it("soft-skips when StandaloneOSX is missing (cloud Sync)", async () => {
    const result = await runDbsFwFoilExtract({
      bundlesDir: "/tmp/placarr-no-fw-client-bundles",
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-standalone-osx");
    expect(result.shaders).toBeUndefined();
  });
});
