import { describe, expect, it } from "vitest";
import { resolveTheGamesDbPlatformId } from "@/services/providers/thegamesdb/platformMap";
import {
  isPalRegionId,
  regionIdToAttachmentRole,
} from "@/services/providers/thegamesdb/regions";

describe("resolveTheGamesDbPlatformId", () => {
  it("maps Placarr platform labels to TGDB ids", () => {
    expect(resolveTheGamesDbPlatformId("PlayStation 2")).toBe(11);
    expect(resolveTheGamesDbPlatformId("Xbox Original")).toBe(14);
    expect(resolveTheGamesDbPlatformId("Nintendo Wii")).toBe(9);
  });
});

describe("regionIdToAttachmentRole", () => {
  it("maps PAL region ids to eu", () => {
    expect(isPalRegionId(6)).toBe(true);
    expect(regionIdToAttachmentRole(6)).toBe("eu");
    expect(regionIdToAttachmentRole(1)).toBe("us");
  });
});
