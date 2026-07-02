import { describe, expect, it } from "vitest";

import {
  coverRoleIndicates3d,
  coverSourceHintsIndicate2d,
  inferCover3dRoleFromHints,
  resolveCoverAttachmentRole,
} from "./coverPerspective";

describe("coverPerspective", () => {
  it("does not treat ChocoBonPlan visuel-produit as 3D (often flat scans)", () => {
    expect(
      coverSourceHintsIndicate2d(
        "https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit.png",
      ),
    ).toBe(true);
    expect(
      inferCover3dRoleFromHints({
        url: "https://chocobonplan.com/wp-content/uploads/2026/02/ball-x-pit-sur-ps5-visuel-produit.png",
        source: "chocobonplan",
        role: "fr",
      }),
    ).toBeNull();
  });

  it("tags explicit box-3d hints as 3d", () => {
    expect(
      inferCover3dRoleFromHints({
        url: "https://example.com/covers/game-box-3d-eu.png",
        role: "eu",
      }),
    ).toBe("3d-eu");
  });

  it("keeps flat retailer scans as non-3d hints", () => {
    expect(
      coverSourceHintsIndicate2d(
        "https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4.png",
      ),
    ).toBe(true);
    expect(
      inferCover3dRoleFromHints({
        url: "https://chocobonplan.com/wp-content/uploads/2020/01/bon-plan-tekken-7-ps4.png",
        source: "chocobonplan",
        role: "fr",
      }),
    ).toBeNull();
  });

  it("recognizes existing 3d roles", () => {
    expect(coverRoleIndicates3d("3d-fr")).toBe(true);
    expect(coverRoleIndicates3d("fr")).toBe(false);
  });

  it("never infers 3D from pixels — flat retailer/gallery covers keep their region", () => {
    expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "wor",
        source: "rawg",
      }),
    ).toBe("wor");
    expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "eu",
        source: "pricecharting",
      }),
    ).toBe("eu");
  });

  it("keeps ChocoBonPlan visuel-produit flat and demotes a stray 3d role", () => {
    expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "3d-fr",
        source: "chocobonplan",
        url: "https://chocobonplan.com/wp-content/uploads/2025/04/alan-wake-edition-deluxe-ps5-visuel-produit.png",
        title: "alan wake edition deluxe ps5 visuel produit",
      }),
    ).toBe("fr");
  });

  it("keeps ScreenScraper box-3D roles authoritative", () => {
    expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "3d-eu",
        source: "screenscraper",
        url: "https://www.screenscraper.fr/images/videogames/box-3D(eu).jpg",
        authoritative3dCoverRoleSource: true,
      }),
    ).toBe("3d-eu");
  });

  it("demotes a stray eBay 3d-marketplace role to marketplace", () => {
    expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "3d-marketplace",
        source: "ebay",
        title: "Alan Wake 2 Deluxe Edition",
      }),
    ).toBe("marketplace");
  });

  it("promotes explicit box-3d URL hints", () => {
    expect(
      resolveCoverAttachmentRole({
        type: "cover",
        role: "eu",
        source: "pricecharting",
        url: "https://example.com/game-box-3d-eu.jpg",
      }),
    ).toBe("3d-eu");
  });
});
