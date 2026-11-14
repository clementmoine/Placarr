/**
 * « Sans image » must use post-hydrate truth when art was borrowed across
 * locales (OPTCG / bestFaceAcrossLocales) — SQL-only filters kept those tiles.
 */
import { describe, expect, it } from "vitest";

import { matchesCatalogueAuditFilter } from "./catalogueCards";
import type { CatalogueCardRow } from "./catalogueCards";

function face(over: Partial<CatalogueCardRow>): CatalogueCardRow {
  return {
    printKey: "onepiece:op01-016-p3",
    set: "op01",
    card: "016-p3",
    lang: "fr",
    artUrl: "",
    hasFoil: false,
    label: "op01 · 016-p3 — Nami",
    name: "Nami",
    kind: "face",
    ...over,
  };
}

describe("matchesCatalogueAuditFilter + borrowed OPTCG faces", () => {
  it("drops FR tiles that borrowed EN/JA art from missingArtOnly", () => {
    const borrowed = face({
      artUrl: "/assets/onepiece/cards/en/op01/016-p3/art.bandai.webp",
      missingArt: false,
      artLocaleFrom: "en",
      languageSpecific: false,
    });
    expect(
      matchesCatalogueAuditFilter(borrowed, { missingArtOnly: true }),
    ).toBe(false);
  });

  it("keeps FR tiles that still have no face after borrow attempt", () => {
    const gap = face({
      artUrl: "",
      missingArt: true,
      languageSpecific: false,
    });
    expect(matchesCatalogueAuditFilter(gap, { missingArtOnly: true })).toBe(
      true,
    );
  });
});
