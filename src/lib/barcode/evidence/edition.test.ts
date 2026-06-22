import { describe, expect, it } from "vitest";

import { buildProductEvidence } from "./parse";
import {
  extractEditionFromText,
  formatDisplayNameWithEdition,
  inferEditionFromNames,
  pickEditionFromEvidence,
} from "./edition";

describe("edition detection", () => {
  it("extracts commercial edition labels", () => {
    expect(extractEditionFromText("Ghost Recon 2 - Classics")).toBe(
      "Classics",
    );
    expect(extractEditionFromText("Halo 2 Platinum")).toBe("Platinum");
    expect(extractEditionFromText("FIFA 08 Player's Choice")).toBe(
      "Player's Choice",
    );
  });

  it("formats display names without duplicating edition", () => {
    expect(
      formatDisplayNameWithEdition("Halo 2", "Classics"),
    ).toBe("Halo 2 — Classics");
    expect(
      formatDisplayNameWithEdition("Halo 2 — Classics", "Classics"),
    ).toBe("Halo 2 — Classics");
  });

  it("infers edition from cached raw names", () => {
    expect(
      inferEditionFromNames(
        ["Halo 2 Classics", "HALO 2", "Halo 2 - Jeu Video Xbox"],
        "Halo 2",
      ),
    ).toBe("Classics");
  });

  it("picks edition from marketplace evidence when canonical title is generic", () => {
    const evidence = [
      buildProductEvidence("ScreenScraper", {
        name: "Tom Clancy's Ghost Recon 2",
      }, true)!,
      buildProductEvidence("PriceCharting", {
        name: "Tom Clancy's Ghost Recon 2 Classics (Xbox)",
      })!,
      buildProductEvidence("AchatMoinsCher", {
        name: "Ghost Recon 2 Classics Xbox PAL",
      })!,
    ];

    expect(
      pickEditionFromEvidence(evidence, "Tom Clancy's Ghost Recon 2"),
    ).toBe("Classics");
  });
});
