import { describe, expect, it } from "vitest";

import {
  canonicalProviderIdForSource,
  isFullWrapCoverSource,
  isGameMediaGallerySource,
  isMusicGallerySource,
  isCanonicalCoverSource,
  isRealBoxCoverSource,
  providerLabelForSource,
  providerImageScoreAdjustmentForSource,
  withProviderAttachmentTraits,
  withProviderFactTraits,
} from "./sourceTraits";

describe("providerSourceTraits", () => {
  it("marque les sources vraie-boîte déclarées par le registre", () => {
    for (const source of [
      "screenscraper",
      "thegamesdb",
      "launchbox",
      "coverproject",
      "booknode",
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

  it("marque la galerie média jeu déclarée par le registre", () => {
    expect(isGameMediaGallerySource("screenscraper")).toBe(true);
    expect(isGameMediaGallerySource("ScreenScraper · fr")).toBe(true);
    expect(isGameMediaGallerySource("launchbox")).toBe(false);
  });

  it("marque la galerie musique déclarée par le registre", () => {
    expect(isMusicGallerySource("discogs")).toBe(true);
    expect(isMusicGallerySource("deezer")).toBe(false);
  });

  it("marque la couverture canonique déclarée par le registre", () => {
    expect(isCanonicalCoverSource("discogs")).toBe(true);
    expect(isCanonicalCoverSource("deezer")).toBe(false);
  });

  it("résout le libellé d'affichage depuis info.label du registre", () => {
    expect(providerLabelForSource("screenscraper")).toBe("ScreenScraper");
    expect(providerLabelForSource("thegamesdb")).toBe("TheGamesDB");
    expect(providerLabelForSource("bgg")).toBe("BoardGameGeek"); // via alias
    expect(providerLabelForSource("ScreenScraper · fr")).toBe("ScreenScraper");
    expect(providerLabelForSource("barcode")).toBeNull(); // tag non-provider
    expect(providerLabelForSource("user")).toBeNull();
    expect(providerLabelForSource(null)).toBeNull();
  });

  it("stampe l'ajustement de score image déclaré par le provider", () => {
    expect(providerImageScoreAdjustmentForSource("picclick")).toBe(-280);
    expect(providerImageScoreAdjustmentForSource("chasseauxlivres")).toBe(-25);
    expect(providerImageScoreAdjustmentForSource("booknode")).toBeUndefined();
  });

  it("stampe flags + libellé dérivés de la source sur l'attachment", () => {
    expect(
      withProviderAttachmentTraits({ source: "coverproject" }),
    ).toMatchObject({
      source: "coverproject",
      isRealBoxCoverSource: true,
      isFullWrapCoverSource: true,
      isGameMediaGallerySource: false,
      providerLabel: "Cover Project",
    });
    expect(
      withProviderAttachmentTraits({ source: "bgg", url: "/c.jpg" }),
    ).toMatchObject({
      url: "/c.jpg",
      isRealBoxCoverSource: true,
      isFullWrapCoverSource: false,
      isGameMediaGallerySource: false,
      isMusicGallerySource: false,
      providerLabel: "BoardGameGeek",
    });
    expect(
      withProviderAttachmentTraits({ source: "discogs", url: "/cover.jpg" }),
    ).toMatchObject({
      isMusicGallerySource: true,
      isCanonicalCoverSource: true,
      isGameMediaGallerySource: false,
    });
    expect(
      withProviderAttachmentTraits({ source: "screenscraper", url: "/box.jpg" }),
    ).toMatchObject({
      isGameMediaGallerySource: true,
      isMusicGallerySource: false,
    });
    expect(
      withProviderAttachmentTraits({ source: "steamgriddb" }),
    ).toMatchObject({
      isRealBoxCoverSource: false,
      isFullWrapCoverSource: false,
      providerLabel: "SteamGridDB",
    });
    expect(withProviderAttachmentTraits({ source: "picclick" })).toMatchObject({
      isRealBoxCoverSource: false,
      isFullWrapCoverSource: false,
      providerImageScoreAdjustment: -280,
      providerLabel: "PicClick (eBay)",
    });
    // Non-provider tag → no propagated label (formatter falls back to its tag map).
    expect(
      withProviderAttachmentTraits({ source: "barcode" }).providerLabel,
    ).toBe(undefined);
  });
});

describe("withProviderFactTraits", () => {
  it("stamps board-game rating and PC-specific facts from registry", () => {
    expect(
      withProviderFactTraits({
        kind: "rating",
        label: "BGG",
        value: "8.1",
        source: "bgg",
      }),
    ).toMatchObject({
      isBoardGameRatingSource: true,
      isPcSpecificFact: false,
      providerLabel: "BoardGameGeek",
    });

    expect(
      withProviderFactTraits({
        kind: "external-link",
        label: "Steam",
        value: "Store",
        source: "steam",
      }),
    ).toMatchObject({
      isPcSpecificFact: true,
      isDigitalStorefrontSource: true,
    });

    expect(
      withProviderFactTraits({
        kind: "external-link",
        label: "SteamDB",
        value: "App",
        source: "steamdb",
      }),
    ).toMatchObject({
      isPcSpecificFact: true,
      isDigitalStorefrontSource: false,
    });

    expect(
      withProviderFactTraits({
        kind: "rating",
        label: "BGG (Bayes)",
        value: "7.8",
      }),
    ).toMatchObject({
      isBoardGameRatingSource: true,
    });

    expect(
      withProviderFactTraits({
        kind: "time-to-beat",
        label: "Main",
        value: "12 h",
        source: "How Long to Beat · PC",
      }),
    ).toMatchObject({
      isHowLongToBeatSource: true,
    });
  });
});
