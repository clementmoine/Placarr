import { describe, expect, it } from "vitest";

import {
  buildCamelCaseTitleVariants,
  buildSeparatorTitleVariants,
  buildStructuralTitleSearchVariants,
  buildTokenEquivalentTitleVariants,
} from "./searchVariants";

describe("buildTokenEquivalentTitleVariants", () => {
  it("swaps colour tokens using shared equivalent groups", () => {
    expect(buildTokenEquivalentTitleVariants("Pokemon Jaune")).toEqual(
      expect.arrayContaining(["Pokemon Yellow"]),
    );
  });
});

describe("buildSeparatorTitleVariants", () => {
  it("splits titles on common separators", () => {
    expect(
      buildSeparatorTitleVariants("The Lapins Crétins : Retour vers le passé"),
    ).toEqual(
      expect.arrayContaining([
        "The Lapins Crétins",
        "Retour vers le passé",
      ]),
    );
  });
});

describe("buildCamelCaseTitleVariants", () => {
  it("splits stylized fused game titles for provider lookup", () => {
    expect(buildCamelCaseTitleVariants("BallXPitt")).toEqual(
      expect.arrayContaining([
        "Ball X Pitt",
        "Ball x Pitt",
        "Ball X Pit",
        "Ball x Pit",
        "Ball Pitt",
        "Ball Pit",
      ]),
    );
  });

  it("ignores titles that already contain spaces or are all-caps", () => {
    expect(buildCamelCaseTitleVariants("Ball Pit")).toEqual([]);
    expect(buildCamelCaseTitleVariants("DOOM")).toEqual([]);
  });
});

describe("buildStructuralTitleSearchVariants", () => {
  it("extracts the subject from a french legend title", () => {
    expect(
      buildStructuralTitleSearchVariants("La Légende Du Dragon"),
    ).toEqual(expect.arrayContaining(["Dragon", "Legend of Dragon"]));
  });

  it("does not inject tokens absent from the source title", () => {
    const variants = buildStructuralTitleSearchVariants(
      "La Petite Fille + La Maison du Lac",
    );
    for (const variant of variants) {
      expect(variant.toLowerCase()).not.toContain("horreur");
      expect(variant.toLowerCase()).not.toContain("force unleashed");
    }
  });

  it("stays bounded for cross-language phrase swaps", () => {
    const variants = buildStructuralTitleSearchVariants(
      "Les Chevaliers de Baphomet : La Malédiction du serpent",
    );
    expect(variants.length).toBeLessThan(40);
    expect(variants).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/broken sword/i),
        expect.stringMatching(/serpent/i),
      ]),
    );
  });

  it("adds colon form for destiny taken king variants", () => {
    const variants = buildStructuralTitleSearchVariants(
      "Destiny Le Roi des Corrompus",
    );
    expect(variants).toEqual(
      expect.arrayContaining(["Destiny: the taken king", "Destiny The taken king"]),
    );
  });

  it("does not emit standalone edition-only search fragments", () => {
    const variants = buildStructuralTitleSearchVariants(
      "Alan Wake II - Deluxe Edition",
    );
    expect(variants).toEqual(
      expect.arrayContaining([
        "Alan Wake 2 - Deluxe Edition",
        "Alan Wake II: Deluxe Edition",
      ]),
    );
    expect(variants).not.toContain("Deluxe Edition");
  });

  it("extracts the franchise root before a french subtitle dash", () => {
    expect(
      buildStructuralTitleSearchVariants(
        "Ni No Kuni 2 - L’avénement d’un nouveau royaume",
      ),
    ).toEqual(expect.arrayContaining(["Ni No Kuni 2"]));
  });

  it("preserves roman numeral ranges like IV-VI", () => {
    const variants = buildStructuralTitleSearchVariants(
      "Tomb Raider IV-VI Remastered Starring Lara Croft",
    );
    expect(variants).toEqual(
      expect.arrayContaining([
        "Tomb Raider 4 5 6 Remastered Starring Lara Croft",
        "Tomb Raider 4-6 Remastered Starring Lara Croft",
      ]),
    );
    expect(variants).not.toContain("Tomb Raider IV");
    expect(variants).not.toContain("VI Remastered Starring Lara Croft");
  });
});
