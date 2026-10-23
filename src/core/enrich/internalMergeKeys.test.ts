import { describe, expect, it } from "vitest";

import {
  isInternalMetadataMergeKey,
  metadataForCachedFicheMerge,
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
  });
});
