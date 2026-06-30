import { describe, expect, it } from "vitest";

import {
  canonicalProviderIdForSource,
  coverProvenanceForSource,
  isFullWrapCoverSource,
  isGameMediaGallerySource,
  isMusicGallerySource,
  isCanonicalCoverSource,
  providerLabelForSource,
  providerImageScoreAdjustmentForSource,
  withProviderAttachmentTraits,
  withProviderFactTraits,
} from "./sourceTraits";

describe("providerSourceTraits", () => {
  it("canonicalise l'alias bgg vers boardgamegeek", () => {
    expect(canonicalProviderIdForSource("bgg")).toBe("boardgamegeek");
  });

  it("ignore la casse et les suffixes · région / variante", () => {
    expect(canonicalProviderIdForSource("ScreenScraper")).toBe("screenscraper");
    expect(canonicalProviderIdForSource("screenscraper · fr")).toBe(
      "screenscraper",
    );
    expect(canonicalProviderIdForSource("thegamesdb/box-2d")).toBe("thegamesdb");
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
    expect(providerImageScoreAdjustmentForSource("ebay")).toBe(-280);
    expect(providerImageScoreAdjustmentForSource("chasseauxlivres")).toBe(-25);
    expect(providerImageScoreAdjustmentForSource("booknode")).toBeUndefined();
  });

  it("stampe flags + libellé dérivés de la source sur l'attachment", () => {
    expect(
      withProviderAttachmentTraits({ source: "coverproject" }),
    ).toMatchObject({
      source: "coverproject",
      isFullWrapCoverSource: true,
      isGameMediaGallerySource: false,
      providerLabel: "Cover Project",
    });
    expect(
      withProviderAttachmentTraits({ source: "bgg", url: "/c.jpg" }),
    ).toMatchObject({
      url: "/c.jpg",
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
      isFullWrapCoverSource: false,
      providerLabel: "SteamGridDB",
    });
    expect(withProviderAttachmentTraits({ source: "ebay" })).toMatchObject({
      isFullWrapCoverSource: false,
      providerImageScoreAdjustment: -280,
      providerLabel: "eBay",
    });
    // Non-provider tag → no propagated label (formatter falls back to its tag map).
    expect(
      withProviderAttachmentTraits({ source: "barcode" }).providerLabel,
    ).toBe(undefined);
  });

  it("résout la provenance d'image depuis les règles URL déclarées par le provider", () => {
    // Geedie: catalog render vs seller's photo of an owned copy.
    expect(
      coverProvenanceForSource(
        "geedie",
        "https://geedie.lt/storage/collectables/32736/abc.jpg",
      ),
    ).toBe("user_photo");
    expect(
      coverProvenanceForSource(
        "geedie",
        "https://geedie.lt/storage/products/ps4-x/640x480-cover.webp",
      ),
    ).toBe("catalog");
    expect(
      coverProvenanceForSource(
        "geedie",
        "https://imagedelivery.net/abc/def/public",
      ),
    ).toBe("catalog");
    // iCollect: its catalogue images are photographs of boxes.
    expect(
      coverProvenanceForSource(
        "icollect",
        "https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg",
      ),
    ).toBe("listing_photo");
    // Providers without rules emit no provenance (scorer defaults to catalog).
    expect(coverProvenanceForSource("screenscraper", "/box.jpg")).toBeUndefined();
    expect(coverProvenanceForSource("geedie", null)).toBeUndefined();
  });

  it("stampe la provenance et préserve celle dérivée de l'URL d'origine", () => {
    expect(
      withProviderAttachmentTraits({
        source: "geedie",
        url: "https://geedie.lt/storage/collectables/1/x.jpg",
      }).coverProvenance,
    ).toBe("user_photo");
    // After localization the URL no longer reveals the bucket; an already-derived
    // provenance must survive re-stamping rather than be cleared.
    expect(
      withProviderAttachmentTraits({
        source: "geedie",
        url: "/uploads/abc.webp",
        coverProvenance: "user_photo",
      }).coverProvenance,
    ).toBe("user_photo");
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
