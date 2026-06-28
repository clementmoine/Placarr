import { describe, expect, it } from "vitest";

import { resolveGameMetadataPlatform } from "./platform";

describe("resolveGameMetadataPlatform", () => {
  it("prefers an explicit platform", () => {
    expect(
      resolveGameMetadataPlatform("ps4", "PlayStation 5", "games"),
    ).toBe("ps4");
  });

  it("normalizes a human-readable platform label", () => {
    expect(
      resolveGameMetadataPlatform("PlayStation 5", undefined, "games"),
    ).toBe("ps5");
  });

  it("derives platform from a platform-specific shelf name", () => {
    expect(
      resolveGameMetadataPlatform(undefined, "PlayStation 5", "games"),
    ).toBe("ps5");
    expect(resolveGameMetadataPlatform(null, "PS4", "games")).toBe("ps4");
    expect(resolveGameMetadataPlatform(undefined, "Switch 2", "games")).toBe(
      "switch2",
    );
    expect(resolveGameMetadataPlatform(undefined, "Steam", "games")).toBe("pc");
    expect(resolveGameMetadataPlatform(undefined, "GOG", "games")).toBe("pc");
  });

  it("returns undefined for generic game shelves", () => {
    expect(
      resolveGameMetadataPlatform(undefined, "Jeux vidéo", "games"),
    ).toBeUndefined();
  });

  it("ignores shelf name for non-game types", () => {
    expect(
      resolveGameMetadataPlatform(undefined, "PlayStation 5", "books"),
    ).toBeUndefined();
  });
});
