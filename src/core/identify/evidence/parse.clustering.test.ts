import { describe, expect, it } from "vitest";

import {
  areEvidenceSameProduct,
  buildProductEvidence,
  evidenceSimilarity,
} from "./parse";
import type { SourceProduct } from "./types";

function canonicalEvidence(name: string, platformKey?: string) {
  const evidence = buildProductEvidence(
    "Test",
    { name, platformKey } as SourceProduct,
    true,
  );
  if (!evidence) throw new Error(`evidence null for ${name}`);
  return evidence;
}

describe("canonical title identity — platform phrase is not identity", () => {
  // Régression Zelda Twilight Princess (barcode 0045496362409) : PriceCharting
  // dit "Zelda Twilight Princess", ScanDex "The Legend of Zelda: Twilight
  // Princess (Wii)". Le "(Wii)" laissé dans le titre d'identité faisait chuter
  // la similarité sous le seuil de fusion → deux clusters d'un seul produit et
  // une confiance divisée par deux. La plateforme est un fait séparé
  // (`platformKey`), elle ne doit pas peser dans l'identité du titre.
  it("clusters short and long franchise forms of the same game", () => {
    const a = canonicalEvidence("Zelda Twilight Princess", "wii");
    const b = canonicalEvidence(
      "The Legend of Zelda: Twilight Princess (Wii)",
      "wii",
    );
    expect(b.parsed.normalizedTitle).not.toContain("wii");
    expect(evidenceSimilarity(a, b)).toBeGreaterThanOrEqual(0.82);
    expect(areEvidenceSameProduct(a, b)).toBe(true);
  });

  it.each([
    ["Halo", "Halo 2"],
    ["Halo 2", "Halo 2 Anniversary"],
  ])("still splits %s from %s (distinctive sequel/subtitle)", (a, b) => {
    expect(
      areEvidenceSameProduct(canonicalEvidence(a), canonicalEvidence(b)),
    ).toBe(false);
  });

  it("keeps a console-hardware title whose name IS the platform", () => {
    const evidence = canonicalEvidence("Nintendo Wii");
    expect(evidence.parsed.normalizedTitle).not.toBe("");
  });
});
