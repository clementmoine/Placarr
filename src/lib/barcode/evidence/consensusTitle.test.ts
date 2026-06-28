import { describe, expect, it } from "vitest";

import { selectConsensusTitle } from "./consensusTitle";

/**
 * One agnostic rule — token corroboration by independent listings — handles every
 * failure mode the old hardcoded override paths needed a dedicated branch for
 * (sequel number, edition subtitle, romhack, year, series prefix…). No
 * per-difference-type logic, no markers, no platform-integral lists.
 */
describe("selectConsensusTitle", () => {
  it("ajoute un millésime que les annonces portent mais pas le canonique", () => {
    expect(
      selectConsensusTitle({
        canonical: ["Just Dance"],
        marketplace: ["Just Dance 2019", "Just Dance 2019"],
      }),
    ).toBe("Just Dance 2019");
  });

  it("jette un mot d'édition canonique qu'aucune annonce ne corrobore (World Party)", () => {
    expect(
      selectConsensusTitle({
        canonical: ["Zumba Fitness World Party"],
        marketplace: [
          "Zumba Fitness Join the Party",
          "Zumba Fitness",
          "Zumba Fitness Join the Party",
          "Zumba Fitness",
          "Zumba Fitness",
        ],
      }),
    ).toBe("Zumba Fitness");
  });

  it("jette un romhack canonique (CTGP Mod) ET garde la plateforme corroborée", () => {
    // Remplace l'ancien drop par marqueurs romhack : « ctgp/mod » n'est dans
    // aucune annonce → tombe ; « Wii » est dans les annonces → gardé.
    expect(
      selectConsensusTitle({
        canonical: ["Mario Kart CTGP Revolution Mod"],
        marketplace: ["Mario Kart Wii", "Mario Kart Wii", "Mario Kart"],
      }),
    ).toBe("Mario Kart Wii");
  });

  it("jette un préfixe de série canonique non corroboré (Nouvelles Attractions)", () => {
    expect(
      selectConsensusTitle({
        canonical: ["Nouvelles Attractions Carnival Fete Foraine"],
        marketplace: [
          "Carnival Fete Foraine",
          "Carnival Fete Foraine",
          "Carnival",
        ],
      }),
    ).toBe("Carnival Fete Foraine");
  });

  it("jette un numéro de suite canonique qu'aucune annonce ne corrobore", () => {
    // ScreenScraper « Ghost Recon 2 », mais les marchands nomment l'original.
    expect(
      selectConsensusTitle({
        canonical: ["Tom Clancy's Ghost Recon 2"],
        marketplace: [
          "Tom Clancy's Ghost Recon",
          "Ghost Recon",
          "Tom Clancy's Ghost Recon",
        ],
      }),
    ).toBe("Tom Clancy's Ghost Recon");
  });

  it("préfère l'orthographe propre à un doublon en minuscules (casse, #3307210117168)", () => {
    // Données réelles : les annonces contiennent à la fois « Tom Clancy's Ghost
    // Recon » (propre) et un doublon « tom clancy ghost recon » (tout en
    // minuscules, plus court d'un caractère). À score égal, la version propre
    // doit gagner — sinon le titre affiché tombe en minuscules.
    expect(
      selectConsensusTitle({
        canonical: ["Ghost Recon : Island Thunder"],
        marketplace: [
          "Ghost Recon",
          "Tom Clancy's Ghost Recon",
          "Tom Clancy's Ghost Recon",
          "Tom Clancy's Ghost Recon 1",
          "tom clancy ghost recon",
          "Ghost Recon",
        ],
      }),
    ).toBe("Tom Clancy's Ghost Recon");
  });

  it("garde un préfixe de marque réel mais minoritaire (Tom Clancy's)", () => {
    expect(
      selectConsensusTitle({
        canonical: ["Tom Clancy's Ghost Recon"],
        marketplace: ["Ghost Recon", "Tom Clancy's Ghost Recon", "Ghost Recon"],
      }),
    ).toBe("Tom Clancy's Ghost Recon");
  });

  it("garde un mot d'édition corroboré partout, en orthographe canonique", () => {
    expect(
      selectConsensusTitle({
        canonical: ["Gottlieb Pinball Classics"],
        marketplace: ["Gottlieb Pinball Classics", "Gottlieb Pinball Classics"],
      }),
    ).toBe("Gottlieb Pinball Classics");
  });

  it("garde l'édition que les annonces nomment massivement (II Arcade)", () => {
    const out = selectConsensusTitle({
      canonical: ["Teenage Mutant Ninja Turtles"],
      marketplace: [
        "Teenage Mutant Ninja Turtles II The Arcade Game",
        "Teenage Mutant Hero Turtles II The Arcade",
        "Teenage Mutant Ninja Turtles II Arcade",
      ],
    });
    expect(out?.toLowerCase()).toContain("arcade");
  });

  it("corrobore un numéro romain comme un chiffre (II == 2, #083717120131)", () => {
    // Sans canonique : « II », « 2 » et « ii » désignent la même suite et doivent
    // se corroborer ensemble, pour que l'édition « II » soit gardée plutôt que la
    // base. Régression : « II » (longueur 2, non chiffre) était jeté des tokens.
    expect(
      selectConsensusTitle({
        canonical: [],
        marketplace: [
          "Teenage Mutant Ninja Turtles II: The Arcade Game",
          "Teenage Mutant Hero Turtles Ii The Arcade Game",
          "Turtles 2 The Arcade Game",
          "Teenage Mutant Ninja Turtles The Arcade Game",
        ],
      }),
    ).toBe("Teenage Mutant Ninja Turtles II: The Arcade Game");
  });

  it("fait confiance au canonique quand il n'y a aucune annonce", () => {
    expect(
      selectConsensusTitle({
        canonical: ["The Legend of Zelda : Skyward Sword"],
        marketplace: [],
      }),
    ).toBe("The Legend of Zelda : Skyward Sword");
  });

  it("renvoie null sans aucun titre", () => {
    expect(selectConsensusTitle({ canonical: [], marketplace: [] })).toBeNull();
  });
});
