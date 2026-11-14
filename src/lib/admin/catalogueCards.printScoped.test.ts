/**
 * Soft-fill print-scoped `/cards/…/art.*` when cards-index has no face yet.
 * Never overrides index basename / remote artUrl / locale-borrow packs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolvePrintScopedCatalogueFace = vi.hoisted(() => vi.fn());

vi.mock("@/providers/shared/cardCatalogue/resolvePrintScopedFace", () => ({
  resolvePrintScopedCatalogueFace,
}));

import { buildCatalogueCardRows } from "@/lib/admin/catalogueCards";

describe("buildCatalogueCardRows print-scoped soft fill", () => {
  beforeEach(() => {
    resolvePrintScopedCatalogueFace.mockReset();
  });

  it("fills missing index art from disk resolve (pokemon)", () => {
    resolvePrintScopedCatalogueFace.mockReturnValue({
      artUrl: "/assets/pokemon/cards/fr/sv1/001/art.mcdn.webp",
      thumbUrl: "/assets/pokemon/prints/sv1-001-fr/thumb",
    });

    const rows = buildCatalogueCardRows(
      "pokemon",
      {
        version: 1,
        pack: "pokemon",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "pokemon:sv1-001": {
            set: "sv1",
            card: "001",
            langs: {
              fr: { name: "Bulbizarre" },
            },
          },
        },
      },
      "fr",
    );

    const fr = rows.find(
      (r) => r.printKey === "pokemon:sv1-001" && r.lang === "fr",
    );
    expect(fr?.artUrl).toBe(
      "/assets/pokemon/cards/fr/sv1/001/art.mcdn.webp",
    );
    expect(resolvePrintScopedCatalogueFace).toHaveBeenCalledWith({
      packId: "pokemon",
      printKey: "pokemon:sv1-001",
      lang: "fr",
    });
  });

  it("does not override an index art basename", () => {
    resolvePrintScopedCatalogueFace.mockReturnValue({
      artUrl: "/assets/pokemon/cards/fr/sv1/001/art.mcdn.webp",
      thumbUrl: "/assets/pokemon/prints/sv1-001-fr/thumb",
    });

    const rows = buildCatalogueCardRows(
      "pokemon",
      {
        version: 1,
        pack: "pokemon",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "pokemon:sv1-001": {
            set: "sv1",
            card: "001",
            langs: {
              fr: { name: "Bulbizarre", art: "art.coleka.webp" },
            },
          },
        },
      },
      "fr",
    );

    const fr = rows.find(
      (r) => r.printKey === "pokemon:sv1-001" && r.lang === "fr",
    );
    expect(fr?.artUrl).toMatch(/\/cards\/fr\/sv1\/001\/art\.coleka\.webp$/);
    expect(resolvePrintScopedCatalogueFace).not.toHaveBeenCalled();
  });

  it("does not soft-fill packs with bestFaceAcrossLocales", () => {
    resolvePrintScopedCatalogueFace.mockReturnValue({
      artUrl: "/assets/naruto/ninja-ranks/cards/fr/nr/0044/art.coleka.webp",
      thumbUrl: "/assets/naruto/ninja-ranks/prints/nr-0044-fr/thumb",
    });

    const rows = buildCatalogueCardRows(
      "naruto/ninja-ranks",
      {
        version: 1,
        pack: "naruto/ninja-ranks",
        generatedAt: "2026-01-01T00:00:00.000Z",
        cards: {
          "naruto:nr-0044": {
            set: "nr",
            card: "0044",
            langs: {
              fr: { name: "Gaï" },
              en: { name: "Guy", art: "art.animecollection.jpg" },
            },
          },
        },
      },
      "fr",
    );

    expect(resolvePrintScopedCatalogueFace).not.toHaveBeenCalled();
    const fr = rows.find(
      (r) => r.printKey === "naruto:nr-0044" && r.lang === "fr",
    );
    // Index/locale path may still borrow EN — soft fill must not short-circuit.
    expect(fr?.artUrl ?? "").not.toContain("art.coleka.webp");
  });
});
