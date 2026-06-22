import { describe, expect, it } from "vitest";

import {
  decodeLaunchBoxTitle,
  extractTitleInstallments,
  installmentAlignmentAdjustment,
  minimumLaunchBoxMatchScore,
  scoreLaunchBoxTitleMatch,
} from "@/services/providers/launchbox/matchScore";

describe("extractTitleInstallments", () => {
  it("ignores release years but keeps sequel numbers", () => {
    expect(extractTitleInstallments("FIFA Football 2004")).toEqual(new Set());
    expect(extractTitleInstallments("Conflict Desert Storm 2")).toEqual(
      new Set([2]),
    );
    expect(extractTitleInstallments("Dead to Rights II")).toEqual(new Set([2]));
  });
});

describe("installmentAlignmentAdjustment", () => {
  it("penalizes sequels when the base game was requested", () => {
    expect(
      installmentAlignmentAdjustment("Tekken", "Tekken 3"),
    ).toBeLessThan(0);
    expect(
      installmentAlignmentAdjustment(
        "Project Gotham Racing",
        "Project Gotham Racing 2",
      ),
    ).toBeLessThan(0);
  });

  it("accepts extended titles for the same product", () => {
    expect(
      installmentAlignmentAdjustment(
        "Game Boy Player",
        "Game Boy Player Start Up Disc",
      ),
    ).toBe(0);
  });
});

describe("scoreLaunchBoxTitleMatch", () => {
  it("prefers the exact game over a sequel on the same platform", () => {
    const tekken = scoreLaunchBoxTitleMatch("Tekken", "Tekken", "PlayStation 1", "Sony Playstation");
    const tekken3 = scoreLaunchBoxTitleMatch(
      "Tekken",
      "Tekken 3",
      "PlayStation 1",
      "Sony Playstation",
    );

    expect(tekken).toBeGreaterThan(tekken3);
  });

  it("rejects unrelated games that only share generic tokens", () => {
    const streetFighterV = scoreLaunchBoxTitleMatch(
      "Street Fighter V",
      "Street Fighter V",
      "PlayStation 4",
      "Sony Playstation 4",
    );
    const xmVsSf = scoreLaunchBoxTitleMatch(
      "Street Fighter V",
      "X-Men vs. Street Fighter",
      "PlayStation 4",
      "Sony Playstation",
    );

    expect(streetFighterV).toBeGreaterThan(xmVsSf);
  });

  it("decodes html entities before comparing", () => {
    expect(decodeLaunchBoxTitle("Wallace &amp; Gromit in Project Zoo")).toBe(
      "Wallace & Gromit in Project Zoo",
    );
  });
});

describe("minimumLaunchBoxMatchScore", () => {
  it("requires a higher threshold for very short titles", () => {
    expect(minimumLaunchBoxMatchScore("Tekken")).toBe(0.72);
    expect(minimumLaunchBoxMatchScore("Tom Clancy's Rainbow Six 3")).toBe(0.58);
  });
});
