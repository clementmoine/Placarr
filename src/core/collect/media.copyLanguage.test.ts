import { describe, expect, it } from "vitest";

import {
  getCoverImage,
  orderedCoverAttachmentsForDisplay,
  resolveMetadataCoverUrl,
} from "./media";

/*
  La langue de l'exemplaire (`Item.language`) choisit la face : une copie FR
  montre d'abord la face FR, même quand une face EN est plus grande. Les autres
  langues restent dans la galerie, derrière.
*/
const FR_FACE = "/assets/tcg/cards/fr/s1/0017/art.alpha.webp";
const EN_FACE = "/assets/tcg/cards/en/s1/0017/art.beta.webp";

function cardItem(language: string | null, metadataPin?: string) {
  return {
    language,
    metadata: {
      ...(metadataPin ? { imageUrl: metadataPin } : {}),
      attachments: [
        {
          type: "cover" as const,
          source: "tcgline",
          role: "tcg-face-en-beta",
          coverProvenance: "catalog",
          url: EN_FACE,
          width: 1200,
          height: 1680,
        },
        {
          type: "cover" as const,
          source: "tcgline",
          role: "tcg-face-fr-alpha",
          coverProvenance: "catalog",
          url: FR_FACE,
          width: 480,
          height: 672,
        },
      ],
    },
    shelf: { type: "cards", name: "Cartes" },
  };
}

describe("copy language drives the face order", () => {
  it("ranks the FR face first on a FR copy, the EN face stays in the gallery", () => {
    expect(
      orderedCoverAttachmentsForDisplay(cardItem("fr")).map((a) => a.url),
    ).toEqual([FR_FACE, EN_FACE]);
  });

  it("ranks the EN face first on an EN copy", () => {
    expect(
      orderedCoverAttachmentsForDisplay(cardItem("en")).map((a) => a.url),
    ).toEqual([EN_FACE, FR_FACE]);
  });

  it("shows the copy-language face as the cover", () => {
    expect(getCoverImage(cardItem("fr"))).toBe(FR_FACE);
    expect(getCoverImage(cardItem("en"))).toBe(EN_FACE);
  });

  it("overrides an enrichment pin on another language", () => {
    expect(resolveMetadataCoverUrl(cardItem("fr", EN_FACE))).toBe(FR_FACE);
  });

  it("keeps an enrichment pin already in the copy language", () => {
    expect(resolveMetadataCoverUrl(cardItem("en", EN_FACE))).toBe(EN_FACE);
  });

  it("without a copy language, quality decides as before", () => {
    expect(
      orderedCoverAttachmentsForDisplay(cardItem(null)).map((a) => a.url),
    ).toEqual([EN_FACE, FR_FACE]);
  });
});
