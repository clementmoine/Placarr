import { describe, expect, it } from "vitest";

import { applyMarketplaceConsensusOverride, compileResultForType } from "./compile";
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
      { provider: "PicClick", name: RS3 },
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
      { provider: "PicClick", name: RS3 },
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
      { provider: "PicClick", name: RS3 },
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
      { provider: "PicClick", name: "Tom Clancy's Ghost Recon" },
      { provider: "ChasseAuxLivres", name: "Tom Clancy's Ghost Recon 1 Classics" },
    ]);

    applyMarketplaceConsensusOverride(evidence);

    const ss = evidence.find((e) => e.providerName === "ScreenScraper");
    expect(ss?.contradictedByConsensus).toBe(true);
    const promoted = evidence.filter(
      (e) => e.providerName !== "ScreenScraper",
    );
    expect(promoted.every((e) => e.isTrustedRetailer)).toBe(true);
  });

  it("ne déclenche pas la contradiction de suite avec moins de 3 marchands", () => {
    const evidence = buildAll([
      { provider: "ScreenScraper", name: "Tom Clancy's Ghost Recon 2" },
      { provider: "AchatMoinsCher", name: "Ghost Recon" },
      { provider: "PicClick", name: "Tom Clancy's Ghost Recon" },
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
      { provider: "PicClick", name: "Tom Clancy's Ghost Recon 2" },
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
          products: [{ name: "Tom Clancy's Ghost Recon 2", platformKey: "xbox" }],
        },
        {
          providerName: "PicClick",
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
          products: [{ name: "Tom Clancy's Ghost Recon 2", platformKey: "xbox" }],
        },
        {
          providerName: "AchatMoinsCher",
          products: [{ name: "Ghost Recon", platformKey: "xbox" }],
        },
        {
          providerName: "PicClick",
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
    // Cas réel : seuls 2 marchands distincts répondent (PicClick en renvoie le
    // gros), aucun ne cite le « 2 ». Le volume d'annonces concordantes doit
    // suffire à démentir l'unique source canonique mal mappée.
    const result = await compileResultForType(
      "games",
      [
        {
          providerName: "ScreenScraper",
          products: [{ name: "Tom Clancy's Ghost Recon 2", platformKey: "xbox" }],
        },
        {
          providerName: "PicClick",
          products: [
            { name: "Tom Clancy's Ghost Recon - Big Box - PC", platformKey: "pc" },
            { name: "Tom Clancy's Ghost Recon Version Française", platformKey: "xbox" },
            { name: "Tom Clancy's Ghost Recon pour PC Big Box", platformKey: "pc" },
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
          products: [{ name: "Teenage Mutant Ninja Turtles", platformKey: "nes" }],
        },
        {
          providerName: "PicClick",
          products: [
            { name: "Teenage Mutant Ninja Turtles (Nintendo NES, 1989)", platformKey: "nes" },
            { name: "Teenage Mutant Ninja Turtles NES CIB", platformKey: "nes" },
            { name: "Teenage Mutant Hero Turtles NES", platformKey: "nes" },
          ],
        },
        {
          providerName: "ChasseAuxLivres",
          products: [{ name: "Teenage Mutant Hero Turtles", platformKey: "nes" }],
        },
      ],
      "083717120032",
    );

    expect(result?.matches[0]?.name?.toLowerCase()).not.toContain("manhattan");
    expect(result?.matches[0]?.name?.toLowerCase()).toContain("turtles");
  });
});
