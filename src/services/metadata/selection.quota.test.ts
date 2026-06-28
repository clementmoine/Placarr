import { describe, expect, it } from "vitest";

import { isMetadataProviderQuotaBlocked } from "@/services/metadata/selection";

describe("isMetadataProviderQuotaBlocked", () => {
  it("returns false for providers without a quota hook", () => {
    expect(isMetadataProviderQuotaBlocked("tmdb")).toBe(false);
  });

  it("delegates to the provider module quota hook when present", () => {
    expect(typeof isMetadataProviderQuotaBlocked("screenscraper")).toBe(
      "boolean",
    );
    expect(typeof isMetadataProviderQuotaBlocked("thegamesdb")).toBe("boolean");
    expect(typeof isMetadataProviderQuotaBlocked("rawg")).toBe("boolean");
  });
});
