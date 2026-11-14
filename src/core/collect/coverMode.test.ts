import { describe, expect, it } from "vitest";
import { isHonoredUserCoverPin } from "./media";
import {
  coverModeAllowsEngineRefresh,
  coverModeIsPinned,
  parseCoverMode,
} from "./coverMode";

describe("coverMode", () => {
  it("parses auto and pinned", () => {
    expect(parseCoverMode("auto")).toBe("auto");
    expect(parseCoverMode("PINNED")).toBe("pinned");
    expect(parseCoverMode("other")).toBeNull();
    expect(parseCoverMode(null)).toBeNull();
  });

  it("allows engine refresh unless pinned", () => {
    expect(coverModeAllowsEngineRefresh(null)).toBe(true);
    expect(coverModeAllowsEngineRefresh("auto")).toBe(true);
    expect(coverModeAllowsEngineRefresh("pinned")).toBe(false);
  });

  it("detects pinned", () => {
    expect(coverModeIsPinned("pinned")).toBe(true);
    expect(coverModeIsPinned("auto")).toBe(false);
  });

  it("isHonoredUserCoverPin respects coverMode over heuristics", () => {
    expect(
      isHonoredUserCoverPin({
        imageUrl: "/uploads/pick.jpg",
        coverMode: "auto",
        updatedAt: new Date("2026-01-02"),
        metadata: {
          imageUrl: "/assets/x/art.webp",
          lastFetched: new Date("2026-01-01"),
          attachments: [],
        },
      }),
    ).toBe(false);
    expect(
      isHonoredUserCoverPin({
        imageUrl: "/uploads/pick.jpg",
        coverMode: "pinned",
        metadata: { attachments: [] },
      }),
    ).toBe(true);
  });
});
