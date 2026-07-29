import { describe, expect, it } from "vitest";

import { foilIndexFromCatalog, PRINT_FOIL_TTL_MS } from "./catalog";

/** Shaped like the real catalogue: cards grouped by type, each with variants. */
function catalog(cards: unknown[], group = "characters") {
  return { cards: { [group]: cards } };
}

describe("foilIndexFromCatalog", () => {
  it("keeps the three fields the published data files leave out", () => {
    expect(
      foilIndexFromCatalog(
        catalog([
          {
            culture_invariant_id: 2178,
            variants: [
              {
                variant_id: "Regular",
                foil_type: "Lore",
                foil_top_layer: "MetallicHotFoil",
                hot_foil_color: "#FF474B",
                second_hot_foil_color: "#B2B2B2",
                second_foil_top_layer_mask_url: "https://example.test/second",
              },
            ],
          },
        ]),
      ),
    ).toEqual({
      "2178": {
        hotFoilColor: "#FF474B",
        secondHotFoilColor: "#B2B2B2",
        secondVarnishMaskUrl: "https://example.test/second",
      },
    });
  });

  it("keys by the id that matches the card index, as a string", () => {
    // `culture_invariant_id` is a number in the catalogue and a string on our
    // side; all 83 coloured variants matched once both are strings.
    const index = foilIndexFromCatalog(
      catalog([
        {
          culture_invariant_id: 1935,
          variants: [{ hot_foil_color: "#79CC5E" }],
        },
      ]),
    );
    expect(Object.keys(index)).toEqual(["1935"]);
  });

  it("skips prints with no colour rather than storing a blank", () => {
    // Only 83 of 3241 carry one; the rest must be absent, not empty, so a
    // lookup can tell "no coat" from "coat of unknown hue".
    expect(
      foilIndexFromCatalog(
        catalog([
          { culture_invariant_id: 1, variants: [{ foil_type: "Silver" }] },
          { culture_invariant_id: 2, variants: [{ hot_foil_color: "  " }] },
          { culture_invariant_id: 3, variants: [] },
          { culture_invariant_id: 4 },
        ]),
      ),
    ).toEqual({});
  });

  it("reads every group, not just the first", () => {
    // The catalogue splits cards into actions, characters, items and locations.
    const index = foilIndexFromCatalog({
      cards: {
        actions: [
          {
            culture_invariant_id: 10,
            variants: [{ hot_foil_color: "#111111" }],
          },
        ],
        locations: [
          {
            culture_invariant_id: 20,
            variants: [{ hot_foil_color: "#222222" }],
          },
        ],
      },
    });
    expect(Object.keys(index).sort()).toEqual(["10", "20"]);
  });

  it("leaves the second coat out when the print has none", () => {
    const index = foilIndexFromCatalog(
      catalog([
        {
          culture_invariant_id: 7,
          variants: [
            { hot_foil_color: "#D9A36D", second_foil_top_layer_mask_url: null },
          ],
        },
      ]),
    );
    expect(index["7"]).toEqual({
      hotFoilColor: "#D9A36D",
      secondHotFoilColor: undefined,
      secondVarnishMaskUrl: undefined,
    });
  });

  it("keeps the first coloured variant when a print has several", () => {
    // Only one coat can be drawn, so which one is picked has to be fixed rather
    // than left to whichever the catalogue happens to list last.
    const index = foilIndexFromCatalog(
      catalog([
        {
          culture_invariant_id: 5,
          variants: [
            { variant_id: "Regular", hot_foil_color: "#FF474B" },
            { variant_id: "Other", hot_foil_color: "#000000" },
          ],
        },
      ]),
    );
    expect(index["5"]?.hotFoilColor).toBe("#FF474B");
  });

  it("survives a catalogue shaped like nothing it expects", () => {
    // A remote payload changing shape must degrade to no colours, never throw:
    // the coat still renders, just without its own hue.
    expect(foilIndexFromCatalog(null)).toEqual({});
    expect(foilIndexFromCatalog({})).toEqual({});
    expect(foilIndexFromCatalog({ cards: "nope" })).toEqual({});
    expect(foilIndexFromCatalog({ cards: { characters: "nope" } })).toEqual({});
  });
});

describe("the refresh window", () => {
  it("outlasts a set release, which is what it is sized against", () => {
    // Sets ship every two to three months and nothing here changes between
    // them, so refetching 4 MB more often would be pure waste.
    const days = PRINT_FOIL_TTL_MS / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThanOrEqual(60);
    expect(days).toBeLessThanOrEqual(100);
  });
});
