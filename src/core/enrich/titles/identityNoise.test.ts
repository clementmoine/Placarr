import { afterEach, describe, expect, it } from "vitest";

import { __resetTokenCorpusIndexForTests } from "@/core/enrich/titles/tokenCorpusIndex";
import { titleSpecificityTokens } from "@/core/identify/evidence/matchUtils";
import {
  LISTING_LOT_PLURAL_GAME_NOUNS,
  LISTING_NOISE_TERMS,
} from "@/core/identify/listingTerms";

import {
  GENERIC_TITLE_TOKENS,
  IDENTITY_EDITION_PACKAGING_TOKENS,
  IDENTITY_FUNCTION_WORDS,
  IDENTITY_LISTING_PACKAGING_NOISE,
  IDENTITY_MEDIA_CATEGORY_TOKENS,
  IDENTITY_VOLUME_STOP_WORDS,
  expandHardwareFinishLookupTitles,
  hardwareFinishConflict,
  hardwareFinishIdsCompatible,
} from "./identityNoise";

describe("hardware finish synonym families", () => {
  it("treats gris and silver as the same retail finish family", () => {
    expect(hardwareFinishIdsCompatible("gray", "silver")).toBe(true);
    expect(
      hardwareFinishConflict(
        "PlayStation 3 Slim Gris",
        "PlayStation 3 Slim Silver",
      ),
    ).toBe(false);
    expect(
      hardwareFinishConflict(
        "PlayStation 3 Slim Gris",
        "PlayStation 3 Slim Black",
      ),
    ).toBe(true);
  });

  it("expands FR gris into EN Gray and Silver seek spellings", () => {
    expect(expandHardwareFinishLookupTitles("PlayStation 3 Slim Gris")).toEqual(
      ["PlayStation 3 Slim Silver", "PlayStation 3 Slim Gray"],
    );
  });
});

describe("GENERIC_TITLE_TOKENS identity-backed packaging", () => {
  afterEach(() => {
    __resetTokenCorpusIndexForTests();
  });

  it("derives media category + edition/version from listing/IDENTITY taxonomies", () => {
    expect(IDENTITY_FUNCTION_WORDS.has("with")).toBe(true);
    expect(LISTING_NOISE_TERMS.includes("jeu")).toBe(true);
    expect(LISTING_NOISE_TERMS.includes("game")).toBe(true);
    expect(LISTING_LOT_PLURAL_GAME_NOUNS.includes("jeux")).toBe(true);
    expect(LISTING_LOT_PLURAL_GAME_NOUNS.includes("games")).toBe(true);
    expect(
      IDENTITY_EDITION_PACKAGING_TOKENS.has("edition") ||
        IDENTITY_VOLUME_STOP_WORDS.has("edition"),
    ).toBe(true);
    expect(IDENTITY_LISTING_PACKAGING_NOISE.has("version")).toBe(true);

    expect(IDENTITY_MEDIA_CATEGORY_TOKENS.has("jeu")).toBe(true);
    expect(IDENTITY_MEDIA_CATEGORY_TOKENS.has("game")).toBe(true);
    expect(IDENTITY_MEDIA_CATEGORY_TOKENS.has("jeux")).toBe(true);
    expect(IDENTITY_MEDIA_CATEGORY_TOKENS.has("games")).toBe(true);
    // The qualifier half of "video game" / "jeu vidéo" — owned here so the
    // comparison sites stop patching it in one by one.
    expect(IDENTITY_MEDIA_CATEGORY_TOKENS.has("video")).toBe(true);

    expect(GENERIC_TITLE_TOKENS.has("with")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("jeu")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("game")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("jeux")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("games")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("edition")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("version")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("video")).toBe(true);
  });

  it("keeps the media qualifier out of the title-stripping taxonomy", () => {
    // "video" is discounted as a distinctive token, never removed from a
    // title — stripping it would turn "Music Video" into "Music".
    expect(LISTING_NOISE_TERMS).not.toContain("video");
  });

  it("cold specificity still drops media/edition chrome without corpus stats", () => {
    const editionTokens = titleSpecificityTokens(
      "Ghost Recon Classics edition",
    );
    expect(editionTokens.has("edition")).toBe(false);
    expect(editionTokens.has("ghost")).toBe(true);

    const versionTokens = titleSpecificityTokens("Mario Kart version FR");
    expect(versionTokens.has("version")).toBe(false);
    expect(versionTokens.has("mario")).toBe(true);

    const mediaTokens = titleSpecificityTokens("Jeu Zelda game");
    expect(mediaTokens.has("jeu")).toBe(false);
    expect(mediaTokens.has("game")).toBe(false);
    expect(mediaTokens.has("zelda")).toBe(true);
  });
});
