import { describe, expect, it } from "vitest";

import {
  canonicalProviderIdForSource,
  isFullWrapCoverSource,
  isRealBoxCoverSource,
  withProviderCoverTraits,
} from "./providerSourceTraits";

describe("providerSourceTraits", () => {
  it("marque les sources vraie-boîte déclarées par le registre", () => {
    for (const source of [
      "screenscraper",
      "thegamesdb",
      "launchbox",
      "coverproject",
      "philibert",
      "okkazeo",
      "freakxy",
    ]) {
      expect(isRealBoxCoverSource(source)).toBe(true);
    }
  });

  it("ne marque pas les sources non vraie-boîte ni les tags non-provider", () => {
    for (const source of [
      "steamgriddb",
      "steam",
      "igdb",
      "rawg",
      "barcode",
      "user",
      "merged",
      null,
      undefined,
    ]) {
      expect(isRealBoxCoverSource(source)).toBe(false);
    }
  });

  it("canonicalise l'alias bgg vers boardgamegeek et conserve le bonus", () => {
    expect(canonicalProviderIdForSource("bgg")).toBe("boardgamegeek");
    expect(isRealBoxCoverSource("bgg")).toBe(true);
  });

  it("ignore la casse et les suffixes · région / variante", () => {
    expect(isRealBoxCoverSource("ScreenScraper")).toBe(true);
    expect(isRealBoxCoverSource("screenscraper · fr")).toBe(true);
    expect(isRealBoxCoverSource("thegamesdb/box-2d")).toBe(true);
    expect(canonicalProviderIdForSource("BGG · fr")).toBe("boardgamegeek");
  });

  it("marque coverproject comme full wrap, pas les autres", () => {
    expect(isFullWrapCoverSource("coverproject")).toBe(true);
    expect(isFullWrapCoverSource("screenscraper")).toBe(false);
    expect(isFullWrapCoverSource("bgg")).toBe(false);
  });

  it("stampe les deux flags dérivés de la source sur l'attachment", () => {
    expect(withProviderCoverTraits({ source: "coverproject" })).toMatchObject({
      source: "coverproject",
      isRealBoxCoverSource: true,
      isFullWrapCoverSource: true,
    });
    expect(withProviderCoverTraits({ source: "bgg", url: "/c.jpg" })).toMatchObject({
      url: "/c.jpg",
      isRealBoxCoverSource: true,
      isFullWrapCoverSource: false,
    });
    expect(withProviderCoverTraits({ source: "steamgriddb" })).toMatchObject({
      isRealBoxCoverSource: false,
      isFullWrapCoverSource: false,
    });
  });
});
