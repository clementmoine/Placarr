import { describe, expect, it } from "vitest";

import { applyMarketplaceConsensusOverride } from "./compile";
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
});
