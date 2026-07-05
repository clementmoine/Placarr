import { afterEach, describe, expect, it, vi } from "vitest";

const quotaBlocked = vi.hoisted(() => vi.fn(() => false));

vi.mock("./cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cache")>();
  return {
    ...actual,
    isScreenScraperQuotaBlocked: quotaBlocked,
  };
});

import { screenscraperModule } from "./index";
import { SCREEN_SCRAPER_ENV_NAMES } from "./env";

describe("screenscraperModule runMappingProbe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    quotaBlocked.mockReset();
    quotaBlocked.mockReturnValue(false);
  });

  it("returns blocked when credentials are missing", async () => {
    for (const name of SCREEN_SCRAPER_ENV_NAMES) {
      vi.stubEnv(name, "");
    }

    const result = await screenscraperModule.runMappingProbe?.();

    expect(result?.statusHint).toBe("blocked");
    expect(result?.reason).toContain("credentials missing");
  });

  it("returns blocked when the API quota cooldown is active", async () => {
    quotaBlocked.mockReturnValue(true);

    const result = await screenscraperModule.runMappingProbe?.();

    expect(result?.statusHint).toBe("blocked");
    expect(result?.reason).toContain("quota exceeded");
  });
});
