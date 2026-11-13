import { describe, expect, it } from "vitest";

import {
  isInternalMetadataMergeKey,
  metadataForCachedFicheMerge,
  SKU_KEY_MERGE_KEY,
} from "./internalMergeKeys";

describe("metadataForCachedFicheMerge", () => {
  it("keeps gap-fill facts but drops stale catalog slots", () => {
    const seeded = metadataForCachedFicheMerge({
      title: "Dracaufeu",
      facts: [
        {
          kind: "format" as const,
          label: "Numéro",
          value: "11",
          source: "tcgdex",
        },
        {
          kind: "tag" as const,
          label: "Type",
          value: "Pokémon",
          source: "tcgdex",
        },
        {
          kind: "external-link" as const,
          label: "Cardmarket",
          value: "Voir la fiche",
          url: "https://www.cardmarket.com/example",
          source: "tcgdex",
        },
        {
          kind: "identifier" as const,
          label: "Référence",
          value: "xy12-11",
          source: "tcgdex",
        },
      ],
    });

    expect(seeded.facts?.map((fact) => fact.kind).sort()).toEqual([
      "external-link",
      "identifier",
    ]);
    expect(isInternalMetadataMergeKey("__cached_fiche__")).toBe(true);
    expect(isInternalMetadataMergeKey(SKU_KEY_MERGE_KEY)).toBe(true);
  });

  it("drops a stale cover pin so a fresh photo demotion can win", () => {
    const seeded = metadataForCachedFicheMerge({
      title: "Kin Tsuchi",
      imageUrl: "/assets/naruto/carddass/cards/fr/s1/ni0057/art.coleka.webp",
      heroImageUrl: "/assets/naruto/carddass/cards/fr/s1/ni0057/art.coleka.webp",
      attachments: [
        {
          type: "cover",
          url: "/assets/naruto/carddass/cards/fr/s1/ni0057/art.coleka.webp",
          coverProvenance: "catalog",
        },
        {
          type: "screenshot",
          url: "/uploads/extra.jpg",
        },
      ],
      facts: [
        {
          kind: "price" as const,
          label: "Cote",
          value: "0.10",
          source: "narutocarddass",
        },
      ],
    });

    expect(seeded.imageUrl).toBeUndefined();
    expect(seeded.heroImageUrl).toBeUndefined();
    expect(seeded.attachments?.map((attachment) => attachment.type)).toEqual([
      "screenshot",
    ]);
    expect(seeded.facts?.map((fact) => fact.kind)).toEqual(["price"]);
  });
});
