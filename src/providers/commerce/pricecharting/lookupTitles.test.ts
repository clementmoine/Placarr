import { describe, expect, it } from "vitest";

import {
  expandPriceChartingFranchiseStemTitles,
  expandPriceChartingLookupTitles,
} from "./lookupTitles";

describe("expandPriceChartingFranchiseStemTitles", () => {
  it("emits Yellow stem from the Special Pikachu Edition shelf title", () => {
    const stems = expandPriceChartingFranchiseStemTitles(
      "Pokémon Yellow Version: Special Pikachu Edition",
    );
    expect(stems.some((title) => /^pokémon yellow version$/i.test(title))).toBe(
      true,
    );
    expect(stems.some((title) => /^pokémon yellow$/i.test(title))).toBe(true);
  });

  it("does not invent a one-token stem", () => {
    expect(expandPriceChartingFranchiseStemTitles("Tetris")).toEqual([]);
  });
});

describe("expandPriceChartingLookupTitles", () => {
  it("includes Pokemon Yellow so PriceCharting search can hit the catalog", () => {
    const variants = expandPriceChartingLookupTitles(
      "Pokémon Yellow Version: Special Pikachu Edition",
    );
    expect(variants.some((title) => /^pokémon yellow$/i.test(title))).toBe(
      true,
    );
  });

  it("expands glued Joycon into Joy-Con / Joy Con catalog spellings", () => {
    const variants = expandPriceChartingLookupTitles(
      "Nintendo Switch Joycon Gris",
    );
    expect(variants.some((title) => /joy-con/i.test(title))).toBe(true);
    expect(variants.some((title) => /joy con/i.test(title))).toBe(true);
  });

  it("expands Switch Joycon Gris → with Gray Joy-Con console catalog title", () => {
    const variants = expandPriceChartingLookupTitles(
      "Nintendo Switch Joycon Gris",
    );
    expect(
      variants.some((title) =>
        /^Nintendo Switch with Gray Joy-Con$/i.test(title),
      ),
    ).toBe(true);
  });

  it("expands bare console titles with System/Console catalog chrome", () => {
    const variants = expandPriceChartingLookupTitles("Nintendo 64");
    expect(variants).toContain("Nintendo 64 System");
    expect(variants).toContain("Nintendo 64 Console");
    expect(variants.some((title) => /lxiv/i.test(title))).toBe(false);
  });

  it("expands FR capacity units to PriceCharting EN (60Go → 60GB)", () => {
    const variants = expandPriceChartingLookupTitles("PlayStation 3 60Go");
    expect(variants.some((title) => /60\s*GB/i.test(title))).toBe(true);
  });

  it("expands FR finish colors to PriceCharting EN (Blanche → White)", () => {
    const variants = expandPriceChartingLookupTitles("Nintendo Wii Blanche");
    expect(variants.some((title) => /white/i.test(title))).toBe(true);
    expect(variants.some((title) => /blanche/i.test(title))).toBe(true);
  });

  it("expands finish-front System seeks (Wii Console White → White … System)", () => {
    const variants = expandPriceChartingLookupTitles("Wii Console White");
    expect(variants.some((title) => /^White Wii System$/i.test(title))).toBe(
      true,
    );
    expect(
      variants.some((title) => /^White Nintendo Wii System$/i.test(title)),
    ).toBe(true);
  });

  it("does not invent Nintendo on PlayStation finish-front seeks", () => {
    const variants = expandPriceChartingLookupTitles("PlayStation 2 Silver");
    expect(variants.some((title) => /nintendo/i.test(title))).toBe(false);
    expect(
      variants.some((title) => /^Silver PlayStation 2 System$/i.test(title)),
    ).toBe(true);
  });

  it("expands Slim Rose → Slim Pink for PriceCharting", () => {
    const variants = expandPriceChartingLookupTitles("PlayStation 2 Slim Rose");
    expect(variants.some((title) => /pink/i.test(title))).toBe(true);
  });

  it("glues spaced platform aliases (PS One → PSOne) and expands System", () => {
    const variants = expandPriceChartingLookupTitles("PS One Slim");
    expect(variants.some((title) => /psone/i.test(title))).toBe(true);
    expect(variants.some((title) => /ps\s*one.*system/i.test(title))).toBe(
      true,
    );
  });

  it("expands bare PSOne to PriceCharting Slim System seeks", () => {
    const variants = expandPriceChartingLookupTitles("PSOne");
    expect(variants).toContain("PSOne Slim System");
    expect(variants).toContain("PSOne Slim Console");
    expect(variants).not.toContain("PSOne System Slim System");
  });

  it("reorders trailing capacity before Super Slim for PriceCharting slugs", () => {
    const variants = expandPriceChartingLookupTitles(
      "Playstation 3 Super Slim 500GB",
    );
    expect(variants).toContain("Playstation 3 500GB Super Slim");
  });

  it("expands platform + edition chrome with System (Xbox 360 Elite)", () => {
    const variants = expandPriceChartingLookupTitles("Xbox 360 Elite");
    expect(variants).toContain("Xbox 360 Elite System");
    expect(variants).toContain("Xbox 360 Elite Console");
  });

  it("inserts Console before capacity (Slim 250Go → Slim Console 250GB)", () => {
    const variants = expandPriceChartingLookupTitles("Xbox 360 Slim 250Go");
    expect(
      variants.some((title) => /^Xbox 360 Slim Console 250\s*GB$/i.test(title)),
    ).toBe(true);
  });
});
