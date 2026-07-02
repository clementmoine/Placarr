import { describe, expect, it } from "vitest";

import {
  buildCoverProjectCdnCandidates,
  resolveCoverProjectPlatformKey,
  slugCoverProjectTitle,
} from "./cdnLookup";

describe("coverproject cdnLookup", () => {
  it("slugifies titles for CDN paths", () => {
    expect(slugCoverProjectTitle("The Legend of Zelda: Skyward Sword")).toBe(
      "thelegendofzeldaskywardsword",
    );
    expect(slugCoverProjectTitle("Mario Kart Wii")).toBe("mariokartwii");
  });

  it("resolves platform keys from RAWG-style names", () => {
    expect(
      resolveCoverProjectPlatformKey(
        "The Legend of Zelda: Skyward Sword",
        "Nintendo Wii",
      ),
    ).toBe("wii");
    expect(
      resolveCoverProjectPlatformKey("Kingdom Hearts", "PlayStation 2"),
    ).toBe("ps2");
  });

  it("builds CDN candidates for Wii titles", () => {
    const candidates = buildCoverProjectCdnCandidates(
      "The Legend of Zelda: Skyward Sword",
      "Nintendo Wii",
    );
    expect(candidates[0]).toBe(
      "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_thelegendofzeldaskywardsword_cover.jpg",
    );
    expect(candidates).toContain(
      "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_thelegendofzeldaskywardsword_thumb.jpg",
    );
  });
});
