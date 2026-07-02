import { describe, expect, it } from "vitest";

import {
  applyMarketplaceConsensusOverride,
  compileResultForType,
} from "./compile";
import { buildProductEvidence } from "./parse";
import type { ProductEvidence } from "./types";

/**
 * Régression code-barres 3307210116864 : 4 marchands indépendants s'accordent
 * sur "Rainbow Six 3" (le produit physique), mais ScreenScraper (seule source
 * canonique) le mappe à tort sur "Rainbow Six Lockdown". Le consensus doit
 * mener ; la source canonique reste une alternative (non supprimée).
 */
function buildAll(
  entries: Array<{ provider: string; name: string }>,
): ProductEvidence[] {
  return entries
    .map(({ provider, name }) =>
      buildProductEvidence(provider, { name, platformKey: "xbox" }),
    )
    .filter((e): e is ProductEvidence => e !== null);
}

const RS3 = "Tom Clancy's Rainbow Six 3";
const LOCKDOWN = "Tom Clancy's Rainbow Six Lockdown";
const GHOST_RECON = "Tom Clancy's Ghost Recon";

describe("applyMarketplaceConsensusOverride", () => {
  it("promeut un consensus marchand qui contredit l'unique source canonique", () => {
    const evidence = buildAll([
      { provider: "ScreenScraper", name: LOCKDOWN },
      { provider: "eBay", name: RS3 },
      { provider: "AchatMoinsCher", name: RS3 },
      { provider: "Freakxy", name: RS3 },
    ]);

    // Pré-condition : SS canonique, les 3 marchands non-ancrés.
    const ss = evidence.find((e) => e.providerName === "ScreenScraper");
    expect(ss?.isCanonical).toBe(true);
    const marketplaceBefore = evidence.filter(
      (e) => !e.isCanonical && !e.isTrustedRetailer,
    );
    expect(marketplaceBefore).toHaveLength(3);

    applyMarketplaceConsensusOverride(evidence);

    // Le consensus est promu (mène, plus de plafond "annonces seules")…
    const consensus = evidence.filter((e) =>
      e.cleanName.toLowerCase().includes("rainbow six 3"),
    );
    expect(consensus.every((e) => e.isTrustedRetailer)).toBe(true);
    // …mais la source canonique reste intacte (alternative la moins prioritaire).
    expect(ss?.isCanonical).toBe(true);
  });

  it("ne touche à rien si moins de 3 marchands distincts s'accordent", () => {
    const evidence = buildAll([
      { provider: "ScreenScraper", name: LOCKDOWN },
      { provider: "eBay", name: RS3 },
      { provider: "AchatMoinsCher", name: RS3 },
    ]);

    applyMarketplaceConsensusOverride(evidence);

    expect(
      evidence.filter((e) => !e.isCanonical && !e.isTrustedRetailer),
    ).toHaveLength(2);
  });

  it("ne touche à rien si un ancrage corrobore déjà le consensus", () => {
    const evidence = buildAll([
      { provider: "ScreenScraper", name: RS3 },
      { provider: "eBay", name: RS3 },
      { provider: "AchatMoinsCher", name: RS3 },
      { provider: "Freakxy", name: RS3 },
    ]);

    applyMarketplaceConsensusOverride(evidence);

    // Aucun marchand promu : la source canonique était déjà d'accord.
    const marketplace = evidence.filter(
      (e) => !e.isCanonical && !e.isTrustedRetailer,
    );
    expect(marketplace.length).toBeGreaterThan(0);
  });

  it("contredit un numéro de suite canonique que des annonces variées démentent", async () => {
    // Cas réel 3307210117168 : ScreenScraper mappe à tort le code-barres sur
    // "Ghost Recon 2", mais les marchands nomment l'original sous des formes
    // variées ("Ghost Recon", "Tom Clancy's Ghost Recon", "… 1 Classics"). Trop
    // dispersées pour un cluster "même produit", elles s'accordent au niveau de
    // la franchise et démentent le "2" : la source canonique ne doit pas gagner.
    const evidence = buildAll([
      { provider: "ScreenScraper", name: "Tom Clancy's Ghost Recon 2" },
      { provider: "AchatMoinsCher", name: "Ghost Recon" },
      { provider: "eBay", name: "Tom Clancy's Ghost Recon" },
      {
        provider: "ChasseAuxLivres",
        name: "Tom Clancy's Ghost Recon 1 Classics",
      },
    ]);

    applyMarketplaceConsensusOverride(evidence);

    const ss = evidence.find((e) => e.providerName === "ScreenScraper");
    expect(ss?.contradictedByConsensus).toBe(true);
    const promoted = evidence.filter((e) => e.providerName !== "ScreenScraper");
    expect(promoted.every((e) => e.isTrustedRetailer)).toBe(true);
  });

  it("ne déclenche pas la contradiction de suite avec moins de 3 marchands", () => {
    const evidence = buildAll([
      { provider: "ScreenScraper", name: "Tom Clancy's Ghost Recon 2" },
      { provider: "AchatMoinsCher", name: "Ghost Recon" },
      { provider: "eBay", name: "Tom Clancy's Ghost Recon" },
    ]);

    applyMarketplaceConsensusOverride(evidence);

    const ss = evidence.find((e) => e.providerName === "ScreenScraper");
    expect(ss?.contradictedByConsensus).toBeFalsy();
  });

  it("ne contredit pas un numéro canonique corroboré par les marchands", () => {
    // Si les marchands citent eux-mêmes le "2", aucune contradiction.
    const evidence = buildAll([
      { provider: "ScreenScraper", name: "Tom Clancy's Ghost Recon 2" },
      { provider: "AchatMoinsCher", name: "Ghost Recon 2" },
      { provider: "eBay", name: "Tom Clancy's Ghost Recon 2" },
      { provider: "ChasseAuxLivres", name: "Ghost Recon 2 Xbox" },
    ]);

    applyMarketplaceConsensusOverride(evidence);

    const ss = evidence.find((e) => e.providerName === "ScreenScraper");
    expect(ss?.contradictedByConsensus).toBeFalsy();
  });

  it("ne laisse pas une source canonique contredite imposer sa plateforme", async () => {
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "ScreenScraper",
          products: [
            { name: "Tom Clancy's Ghost Recon 2", platformKey: "xbox" },
          ],
        },
        {
          providerName: "eBay",
          products: [{ name: GHOST_RECON, platformKey: "pc" }],
        },
        {
          providerName: "AchatMoinsCher",
          products: [{ name: GHOST_RECON, platformKey: "pc" }],
        },
        {
          providerName: "Freakxy",
          products: [{ name: GHOST_RECON, platformKey: "pc" }],
        },
      ],
      "3307210117168",
    );

    expect(result?.matches[0]?.name).toBe(GHOST_RECON);
    expect(result?.platformKey).toBe("pc");
  });

  it("ne renvoie pas la suite quand les marchands démentent le numéro (données réelles)", async () => {
    // Reproduit la dispersion réelle des annonces du code-barres 3307210117168
    // (ScreenScraper a un mauvais mapping vers "Ghost Recon 2").
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "ScreenScraper",
          products: [
            { name: "Tom Clancy's Ghost Recon 2", platformKey: "xbox" },
          ],
        },
        {
          providerName: "AchatMoinsCher",
          products: [{ name: "Ghost Recon", platformKey: "xbox" }],
        },
        {
          providerName: "eBay",
          products: [
            { name: "Tom Clancy's Ghost Recon", platformKey: "xbox" },
            { name: "Ghost Recon Xbox", platformKey: "xbox" },
          ],
        },
        {
          providerName: "ChasseAuxLivres",
          products: [{ name: "Tom Clancy's Ghost Recon", platformKey: "xbox" }],
        },
      ],
      "3307210117168",
    );

    expect(result?.matches[0]?.name).not.toMatch(/\b2\b/);
    expect(result?.matches[0]?.name?.toLowerCase()).toContain("ghost recon");
  });

  it("dément un numéro de suite via le volume d'un seul marchand dominant (#3307210117168)", async () => {
    // Cas réel : seuls 2 marchands distincts répondent (eBay en renvoie le
    // gros), aucun ne cite le « 2 ». Le volume d'annonces concordantes doit
    // suffire à démentir l'unique source canonique mal mappée.
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "ScreenScraper",
          products: [
            { name: "Tom Clancy's Ghost Recon 2", platformKey: "xbox" },
          ],
        },
        {
          providerName: "eBay",
          products: [
            {
              name: "Tom Clancy's Ghost Recon - Big Box - PC",
              platformKey: "pc",
            },
            {
              name: "Tom Clancy's Ghost Recon Version Française",
              platformKey: "xbox",
            },
            {
              name: "Tom Clancy's Ghost Recon pour PC Big Box",
              platformKey: "pc",
            },
            { name: "Ghost Recon Xbox", platformKey: "xbox" },
            { name: "Tom Clancy's Ghost Recon Classics", platformKey: "xbox" },
          ],
        },
        {
          providerName: "AchatMoinsCher",
          products: [{ name: "Ghost Recon", platformKey: "xbox" }],
        },
      ],
      "3307210117168",
    );

    expect(result?.matches[0]?.name).not.toMatch(/\b2\b/);
    expect(result?.matches[0]?.name?.toLowerCase()).toContain("ghost recon");
    // La suite démentie ("… Ghost Recon 2") ne doit PAS ressortir comme
    // alternative : c'est le mauvais mapping, pas un produit que l'on voudrait
    // ranger. Aucun match ne doit citer le numéro contredit.
    expect(result?.matches.some((m) => /\b2\b/.test(m.name))).toBe(false);
  });

  it("dément un SOUS-TITRE d'édition canonique non corroboré (#3307210117168 Island Thunder)", async () => {
    // Cas réel : ScreenScraper mappe à tort le code-barres du jeu de BASE sur
    // l'extension « Ghost Recon : Island Thunder », mais toutes les annonces
    // nomment la base (« Tom Clancy's Ghost Recon », « … Classics », « … 1 ») et
    // AUCUNE ne dit « Island Thunder ». Le sous-titre non corroboré doit être
    // déclassé — la base mène, et l'extension ne ressort pas en alternative.
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "ScreenScraper",
          products: [
            { name: "Ghost Recon : Island Thunder", platformKey: "xbox" },
          ],
        },
        {
          providerName: "eBay",
          products: [
            {
              name: "Tom Clancy's Ghost Recon Classics Xbox",
              platformKey: "xbox",
            },
            {
              name: "Tom Clancy's Ghost Recon Version Française Xbox",
              platformKey: "xbox",
            },
            { name: "Ghost Recon Xbox", platformKey: "xbox" },
            {
              name: "Tom Clancy's Ghost Recon 1 sans notice Xbox",
              platformKey: "xbox",
            },
            { name: "Ghost Recon Classics Edition Xbox", platformKey: "xbox" },
            // Annonce bruitée du MÊME jeu de base (texte vendeur + cross-sell
            // "Rainbow six") : elle échoue areLikelySameProduct contre le leader
            // propre et ne doit PAS ressortir comme 2e candidat.
            {
              name: "Tom Clancy's Ghost Recon pour PC - Complet FRA - Big Box Ubisoft Rainbow six",
              platformKey: "pc",
            },
          ],
        },
        {
          providerName: "AchatMoinsCher",
          products: [{ name: "Tom Clancy's Ghost Recon", platformKey: "xbox" }],
        },
      ],
      "3307210117168",
    );

    expect(result?.matches[0]?.name?.toLowerCase()).toContain("ghost recon");
    expect(result?.matches[0]?.name?.toLowerCase()).not.toContain("island");
    expect(result?.matches.some((m) => /island|thunder/i.test(m.name))).toBe(
      false,
    );
    // La base identifiée mène en UN seul résultat : ni l'extension, ni les
    // annonces bruitées de la même base ne forment de candidats séparés.
    expect(result?.matches).toHaveLength(1);
    expect(result?.matches.some((m) => /rainbow|big box/i.test(m.name))).toBe(
      false,
    );
  });

  it("dément un numéro d'édition canonique via un canonique pair + volume (#083717120032)", async () => {
    // Cas réel : ScreenScraper mappe à tort sur « TMNT III : The Manhattan
    // Project », mais un second canonique (IGDB via ScanDex) nomme l'original et
    // les marchands le corroborent. La source numérotée doit être déclassée.
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "ScreenScraper",
          products: [
            {
              name: "Teenage Mutant Ninja Turtles III : The Manhattan Project",
              platformKey: "nes",
            },
          ],
        },
        {
          providerName: "ScanDex",
          products: [
            { name: "Teenage Mutant Ninja Turtles", platformKey: "nes" },
          ],
        },
        {
          providerName: "eBay",
          products: [
            {
              name: "Teenage Mutant Ninja Turtles (Nintendo NES, 1989)",
              platformKey: "nes",
            },
            {
              name: "Teenage Mutant Ninja Turtles NES CIB",
              platformKey: "nes",
            },
            { name: "Teenage Mutant Hero Turtles NES", platformKey: "nes" },
          ],
        },
        {
          providerName: "ChasseAuxLivres",
          products: [
            { name: "Teenage Mutant Hero Turtles", platformKey: "nes" },
          ],
        },
      ],
      "083717120032",
    );

    expect(result?.matches[0]?.name?.toLowerCase()).not.toContain("manhattan");
    expect(result?.matches[0]?.name?.toLowerCase()).toContain("turtles");
  });

  it("laisse l'édition que les marchands nomment massivement mener, sans canonique (#083717120131)", async () => {
    // Aucune source canonique : PriceCharting mappe à tort sur le jeu de BASE,
    // mais 5 annonces de 2 marchands nomment « II : The Arcade Game ». L'édition
    // doit l'emporter, pas la base.
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "PriceCharting",
          products: [
            { name: "Teenage Mutant Ninja Turtles", platformKey: "nes" },
          ],
        },
        {
          providerName: "eBay",
          products: [
            {
              name: "Teenage Mutant Ninja Turtles II: The Arcade Game (Nintendo NES, 1991 PAL A)",
              platformKey: "nes",
            },
            {
              name: "Teenage Mutant Ninja Turtles II Arcade TMNT NES Complete CIB",
              platformKey: "nes",
            },
            {
              name: "Teenage Mutant Hero Turtles II - The Arcade Game",
              platformKey: "nes",
            },
            {
              name: "Turtles 2 The Arcade Game Nintendo Nes",
              platformKey: "nes",
            },
          ],
        },
        {
          providerName: "ChasseAuxLivres",
          products: [
            {
              name: "Teenage Mutant Hero Turtles II The Arcade Game",
              platformKey: "nes",
            },
          ],
        },
      ],
      "083717120131",
    );

    expect(result?.matches[0]?.name?.toLowerCase()).toContain("arcade");
  });

  it("laisse l'édition mener même quand un SEUL marchand la nomme en masse (#083717120131)", async () => {
    // Variante réelle du même code-barres : ChasseAuxLivres n'a pas répondu, donc
    // seul eBay nomme « II : The Arcade Game » — mais sur un fort volume
    // d'annonces indépendantes. Sans relâchement du verrou « ≥2 marchands », le
    // fallback base de données résolvait à tort le jeu de BASE de PriceCharting
    // et écartait les annonces « II » comme du bruit.
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "PriceCharting",
          products: [
            { name: "Teenage Mutant Ninja Turtles", platformKey: "nes" },
          ],
        },
        {
          providerName: "eBay",
          products: [
            {
              name: "Teenage Mutant Ninja Turtles II: The Arcade Game (Nintendo NES, 1991 PAL A)",
              platformKey: "nes",
            },
            {
              name: "Teenage Mutant Ninja Turtles II Arcade TMNT NES Complete CIB",
              platformKey: "nes",
            },
            {
              name: "Teenage Mutant Hero Turtles II - The Arcade Game",
              platformKey: "nes",
            },
            {
              name: "Turtles 2 The Arcade Game Nintendo Nes",
              platformKey: "nes",
            },
            {
              name: "Teenage Mutant Hero Turtles Ii The Arcade Game Nes Testato",
              platformKey: "nes",
            },
            {
              name: "Teenage Mutant Ninja Turtles II Arcade TMNT Complete in Box",
              platformKey: "nes",
            },
            {
              name: "Teenage Mutant Ninja Turtles The Arcade Game",
              platformKey: "nes",
            },
          ],
        },
      ],
      "083717120131",
    );

    expect(result?.matches[0]?.name?.toLowerCase()).toContain("arcade");
    expect(result?.matches[0]?.name?.toLowerCase()).not.toBe(
      "teenage mutant ninja turtles",
    );
    // Les variantes bruitées de la MÊME édition (texte vendeur « Gig », « CIB »,
    // « Complete in Box »…) ne doivent pas ressortir comme candidats séparés :
    // le consensus les promeut toutes en trusted-retailer, mais elles nomment le
    // même produit que le leader. Régression « énormément de résultats ».
    const arcadeMatches = (result?.matches ?? []).filter((m) =>
      m.name.toLowerCase().includes("arcade"),
    );
    expect(arcadeMatches).toHaveLength(1);
  });

  it("ne garde pas la suite démentie d'une franchise courte (#4005209105378 de Blob)", async () => {
    // ScreenScraper mappe à tort sur « de Blob 2 », mais PriceCharting et 4
    // marchands nomment la base « De Blob ». La franchise n'a qu'un mot
    // identifiant ("blob") — sous le garde ≥2 de l'override d'édition — donc le
    // consensus strict mène ; la suite « de Blob 2 » NE doit PAS rester en
    // alternative, et aucun « — Edition » parasite ne doit apparaître.
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "ScreenScraper",
          products: [{ name: "de Blob 2", platformKey: "wii" }],
        },
        {
          providerName: "PriceCharting",
          products: [{ name: "De Blob Nintendo Wii", platformKey: "wii" }],
        },
        {
          providerName: "AchatMoinsCher",
          products: [{ name: "De Blob", platformKey: "wii" }],
        },
        {
          providerName: "Freakxy",
          products: [{ name: "De Blob Nintendo Wii", platformKey: "wii" }],
        },
        {
          providerName: "eBay",
          products: [
            { name: "De Blob Nintendo Wii", platformKey: "wii" },
            {
              name: "De Blob Nintendo Wii Edition Fr Pal Complet",
              platformKey: "wii",
            },
            { name: "de BLOB Nintendo Wii Pal neuf", platformKey: "wii" },
          ],
        },
      ],
      "4005209105378",
    );

    expect(result?.matches[0]?.name?.toLowerCase()).toContain("blob");
    expect(result?.matches.some((m) => /\b2\b/.test(m.name))).toBe(false);
    expect(result?.edition).toBeNull();
  });

  it("écarte un romhack canonique au profit du jeu officiel (#045496365226)", async () => {
    // ScreenScraper renvoie le romhack « Mario Kart CTGP Revolution Mod » ; les
    // annonces nomment le jeu officiel. Le romhack n'a pas de code-barres retail
    // → il est écarté, et ne doit jamais apparaître dans le résultat.
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "ScreenScraper",
          products: [
            { name: "Mario Kart CTGP Revolution Mod", platformKey: "wii" },
          ],
        },
        {
          providerName: "PriceCharting",
          products: [{ name: "Mario Kart Wii", platformKey: "wii" }],
        },
        {
          providerName: "eBay",
          products: [
            { name: "Mario Kart Wii Nintendo", platformKey: "wii" },
            { name: "Jeu Wii Mario Kart Wii Complet", platformKey: "wii" },
          ],
        },
      ],
      "045496365226",
    );

    expect(result?.matches[0]?.name?.toLowerCase()).toContain("mario kart");
    expect(
      result?.matches.some((m) => /ctgp|revolution|mod/i.test(m.name)),
    ).toBe(false);
  });
});
