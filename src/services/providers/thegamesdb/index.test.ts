import { afterEach, describe, expect, it, vi } from "vitest";

import { thegamesdbModule } from "./index";

describe("thegamesdbModule runMappingProbe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns blocked when the API key is missing", async () => {
    vi.stubEnv("THEGAMESDB_API_KEY", "");
    const result = await thegamesdbModule.runMappingProbe?.();
    expect(result?.statusHint).toBe("blocked");
    expect(result?.reason).toContain("THEGAMESDB_API_KEY");
  });
});
