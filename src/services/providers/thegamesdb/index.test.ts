import { afterEach, describe, expect, it, vi } from "vitest";

const quotaBlocked = vi.hoisted(() => vi.fn(() => false));

vi.mock("./quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./quota")>();
  return {
    ...actual,
    isTheGamesDbQuotaBlocked: quotaBlocked,
  };
});

import { thegamesdbModule } from "./index";

describe("thegamesdbModule runMappingProbe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    quotaBlocked.mockReset();
    quotaBlocked.mockReturnValue(false);
  });

  it("returns blocked when the API key is missing", async () => {
    vi.stubEnv("THEGAMESDB_API_KEY", "");
    const result = await thegamesdbModule.runMappingProbe?.();
    expect(result?.statusHint).toBe("blocked");
    expect(result?.reason).toContain("THEGAMESDB_API_KEY");
  });

  it("returns blocked when the API quota cooldown is active", async () => {
    quotaBlocked.mockReturnValue(true);
    const result = await thegamesdbModule.runMappingProbe?.();
    expect(result?.statusHint).toBe("blocked");
    expect(result?.reason).toContain("quota exceeded");
  });
});
