import { describe, expect, it } from "vitest";

import {
  icollectAttachmentRole,
  icollectImageKindFromLabel,
  icollectRoleWithoutCollectorRegion,
} from "./imageLabels";

describe("icollect imageLabels", () => {
  it("maps Main Image 1/2/3 to front/back/disc", () => {
    expect(
      icollectImageKindFromLabel("Devil May Cry - Main Image 1", "..._1.jpg"),
    ).toBe("cover");
    expect(
      icollectImageKindFromLabel("Devil May Cry - Main Image 2", "..._2.jpg"),
    ).toBe("back");
    expect(
      icollectImageKindFromLabel("Gears Of War - Main Image 3", "..._3.jpg"),
    ).toBe("disc");
  });

  it("falls back to the filename index when the label is missing", () => {
    expect(
      icollectImageKindFromLabel(undefined, "https://example.com/892033_2.jpg"),
    ).toBe("back");
  });

  it("builds region-aware attachment roles", () => {
    expect(
      icollectAttachmentRole(
        "Little Nightmares - Main Image 2",
        "https://example.com/123_2.jpg",
        "us",
      ),
    ).toBe("back-us");
    expect(
      icollectAttachmentRole(
        "Little Nightmares - Main Image 1",
        "https://example.com/123_1.jpg",
        "fr",
      ),
    ).toBe("fr");
  });

  it("strips collector region tokens when the rating board is unknown", () => {
    expect(icollectRoleWithoutCollectorRegion("jp")).toBeUndefined();
    expect(icollectRoleWithoutCollectorRegion("back-jp")).toBe("back");
    expect(icollectRoleWithoutCollectorRegion("disc-us")).toBe("disc");
  });
});
