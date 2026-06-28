import { describe, expect, it } from "vitest";

import { buildProductEvidence } from "./parse";
import {
  extractEditionFromText,
  formatDisplayNameWithEdition,
  inferEditionFromNames,
  pickEditionFromEvidence,
} from "./edition";

describe("edition detection", () => {
  it("extracts commercial edition labels", () => {
    expect(extractEditionFromText("Ghost Recon 2 - Classics")).toBe("Classics");
    expect(extractEditionFromText("Halo 2 Platinum")).toBe("Platinum");
    expect(extractEditionFromText("FIFA 08 Player's Choice")).toBe(
      "Player's Choice",
    );
  });

  it("formats display names without duplicating edition", () => {
    expect(formatDisplayNameWithEdition("Halo 2", "Classics")).toBe(
      "Halo 2 — Classics",
    );
    expect(formatDisplayNameWithEdition("Halo 2 — Classics", "Classics")).toBe(
      "Halo 2 — Classics",
    );
  });

  it("infers edition from cached raw names", () => {
    expect(
      inferEditionFromNames(
        ["Halo 2 Classics", "HALO 2", "Halo 2 - Jeu Video Xbox"],
        "Halo 2",
      ),
    ).toBe("Classics");
  });

  it("extrait l'édition spécifique malgré les accents mélangés", () => {
    // "Edition Limitée" (E sans accent, é avec) doit donner le label spécifique,
    // pas le générique "Edition".
    expect(extractEditionFromText("Skyward Sword Edition Limitée Neuf")).toBe(
      "Édition Limitée",
    );
    expect(extractEditionFromText("Skyward Sword Limited Edition")).toBe(
      "Édition Limitée",
    );
  });

  it("préfère l'édition la plus nommée quand un seul marchand domine", () => {
    // 4 annonces "Édition Limitée" (PicClick) doivent battre une "Special
    // Edition" isolée → générique "Edition", malgré le même fournisseur unique.
    const evidence = [
      buildProductEvidence(
        "ScreenScraper",
        {
          name: "The Legend of Zelda - Skyward Sword",
        },
        true,
      )!,
      buildProductEvidence("PicClick", {
        name: "Skyward Sword Édition Limitée Neuf",
      })!,
      buildProductEvidence("PicClick", {
        name: "Skyward Sword Edition Limitée Wii",
      })!,
      buildProductEvidence("PicClick", {
        name: "Skyward Sword Edition Limitée FRA",
      })!,
      buildProductEvidence("PicClick", {
        name: "Skyward Sword Edition Limitée Complet",
      })!,
      buildProductEvidence("PicClick", {
        name: "Skyward Sword Special Edition",
      })!,
    ];

    expect(
      pickEditionFromEvidence(evidence, "The Legend of Zelda - Skyward Sword"),
    ).toBe("Édition Limitée");
  });

  it("ignore un « Edition » générique isolé (fragment régional/emballage)", () => {
    // "De Blob … Edition Fr Pal" d'une seule annonce ne doit PAS inventer une
    // édition sur le jeu de base.
    const evidence = [
      buildProductEvidence("PriceCharting", { name: "De Blob Nintendo Wii" })!,
      buildProductEvidence("PicClick", {
        name: "De Blob Nintendo Wii Edition Fr Pal Complet",
      })!,
    ];
    expect(pickEditionFromEvidence(evidence, "De Blob")).toBeNull();
    // …mais une vraie édition spécifique d'une seule annonce reste captée.
    expect(
      inferEditionFromNames(["De Blob Classics", "De Blob Wii"], "De Blob"),
    ).toBe("Classics");
  });

  it("ne surface jamais un « Edition » générique, même corroboré (#5030917070914)", () => {
    // Plusieurs annonces « … Edition Réflexes » : « Réflexes » n'est pas dans le
    // vocabulaire d'éditions, donc l'extraction retombe sur le label générique
    // « Edition ». Un « — Edition » nu n'informe de rien → jamais affiché, même
    // avec ≥2 fournisseurs (régression « Call Of Duty Modern Warfare — Edition »).
    const evidence = [
      buildProductEvidence("PicClick", {
        name: "Call Of Duty Modern Warfare Edition Réflexes",
      })!,
      buildProductEvidence("AchatMoinsCher", {
        name: "Call Of Duty Modern Warfare Reflex Edition",
      })!,
    ];
    expect(
      pickEditionFromEvidence(evidence, "Call Of Duty Modern Warfare"),
    ).toBeNull();
  });

  it("picks edition from marketplace evidence when canonical title is generic", () => {
    const evidence = [
      buildProductEvidence(
        "ScreenScraper",
        {
          name: "Tom Clancy's Ghost Recon 2",
        },
        true,
      )!,
      buildProductEvidence("PriceCharting", {
        name: "Tom Clancy's Ghost Recon 2 Classics (Xbox)",
      })!,
      buildProductEvidence("AchatMoinsCher", {
        name: "Ghost Recon 2 Classics Xbox PAL",
      })!,
    ];

    expect(
      pickEditionFromEvidence(evidence, "Tom Clancy's Ghost Recon 2"),
    ).toBe("Classics");
  });
});
