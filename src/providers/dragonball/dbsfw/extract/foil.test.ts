import { describe, expect, it } from "vitest";

import { foilKitStepFresh } from "@/providers/dragonball/dbsfw/cdn/ensureClient";

import { runDbsFwFoilExtract } from "./foil";

describe("runDbsFwFoilExtract", () => {
  it("soft-skips when no client is staged (never downloads itself)", async () => {
    const result = await runDbsFwFoilExtract({
      stagingRoot: "/tmp/placarr-no-fw-client-staging",
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-cdn-client");
    expect(result.shaders).toBeUndefined();
  });

  it("treats faces kit stamp as fresh only when complete and unforced", () => {
    const stamp = {
      version: "97",
      buildId: "b",
      stem: "s",
      volumeCount: 1,
      fetchedAt: "2026-01-01T00:00:00.000Z",
      kit: { facesOk: true },
    };
    expect(foilKitStepFresh(stamp, "facesOk")).toBe(true);
    expect(foilKitStepFresh(stamp, "facesOk", { force: true })).toBe(false);
  });
});
