import { afterEach, describe, expect, it } from "vitest";

import { __resetTokenCorpusIndexForTests } from "@/core/enrich/titles/tokenCorpusIndex";
import { titleSpecificityTokens } from "@/core/identify/evidence/matchUtils";

import {
  GENERIC_TITLE_TOKENS,
  IDENTITY_EDITION_PACKAGING_TOKENS,
  IDENTITY_FUNCTION_WORDS,
  IDENTITY_LISTING_PACKAGING_NOISE,
  IDENTITY_VOLUME_STOP_WORDS,
} from "./identityNoise";

describe("GENERIC_TITLE_TOKENS identity-backed packaging", () => {
  afterEach(() => {
    __resetTokenCorpusIndexForTests();
  });

  it("keeps edition/version via IDENTITY taxonomies (no bare duplicate with)", () => {
    expect(IDENTITY_FUNCTION_WORDS.has("with")).toBe(true);
    expect(
      IDENTITY_EDITION_PACKAGING_TOKENS.has("edition") ||
        IDENTITY_VOLUME_STOP_WORDS.has("edition"),
    ).toBe(true);
    expect(IDENTITY_LISTING_PACKAGING_NOISE.has("version")).toBe(true);

    expect(GENERIC_TITLE_TOKENS.has("with")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("edition")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("version")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("jeu")).toBe(true);
    expect(GENERIC_TITLE_TOKENS.has("game")).toBe(true);
  });

  it("cold specificity still drops edition/version without corpus stats", () => {
    const editionTokens = titleSpecificityTokens(
      "Ghost Recon Classics edition",
    );
    expect(editionTokens.has("edition")).toBe(false);
    expect(editionTokens.has("ghost")).toBe(true);

    const versionTokens = titleSpecificityTokens("Mario Kart version FR");
    expect(versionTokens.has("version")).toBe(false);
    expect(versionTokens.has("mario")).toBe(true);
  });
});
