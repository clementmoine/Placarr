import { describe, expect, it } from "vitest";

import { packFamilies, prepareCandidates } from "./optimize";
import { solveBuyPlan } from "./solve";
import type { Requirement, SealedSku } from "./types";

function holes(count: number, priceCents: number): Requirement[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    acceptedPrints: [`c${i}`],
    requiredCopies: 1,
    ownedCopies: 0,
    priceCents,
  }));
}

function hitMap(poolSize: number, p: number): Map<string, number> {
  const hit = new Map<string, number>();
  for (let i = 0; i < poolSize; i++) hit.set(`c${i}`, p);
  return hit;
}

function pack(input: {
  slug: string;
  name?: string;
  priceCents: number;
  packs?: number;
  hit: Map<string, number>;
}): SealedSku {
  return {
    slug: input.slug,
    name: input.name ?? input.slug,
    priceCents: input.priceCents,
    guaranteed: [],
    guaranteedPartial: false,
    packs: input.packs ?? 1,
    packHitByPrint: input.hit,
    provenance: "official",
  };
}

describe("packFamilies / prepareCandidates", () => {
  it("regroupe booster, display et trove au même tirage ; l'unité est le booster", () => {
    const hit = hitMap(200, 12 / 200);
    const booster = pack({ slug: "booster", priceCents: 450, hit });
    const display = pack({ slug: "display", priceCents: 9000, packs: 24, hit });
    const trove = pack({ slug: "trove", priceCents: 4500, packs: 8, hit });
    const families = packFamilies([booster, display, trove]);
    expect(families).toHaveLength(1);
    expect(families[0]!.unit.slug).toBe("booster");
    expect(families[0]!.members.map((m) => m.slug).sort()).toEqual([
      "booster",
      "display",
      "trove",
    ]);
    const prepared = prepareCandidates({
      requirements: holes(200, 100),
      skus: [booster, display, trove],
    });
    expect(prepared.candidates).toHaveLength(1);
    expect(prepared.referencePackCents).toBe(450);
  });

  it("arts / langues fongibles : un seul candidat, pas ×4 lignes", () => {
    const hit = hitMap(100, 0.1);
    const skus = ["minnie", "donald", "jafar", "elsa"].map((slug, i) =>
      pack({ slug, priceCents: 450 + i, hit }),
    );
    const plan = solveBuyPlan({ requirements: holes(100, 50), skus });
    expect(plan.mixed.items.length).toBeLessThanOrEqual(1);
    expect(plan.mixed.items[0]?.slug).toBe("minnie");
  });
});

describe("consolidation", () => {
  it("mixte : un display remplace ~24 boosters quand il est moins cher", () => {
    const hit = hitMap(200, 12 / 200);
    const booster = pack({ slug: "booster", priceCents: 450, hit });
    const display = pack({ slug: "display", priceCents: 9000, packs: 24, hit });
    const plan = solveBuyPlan({
      requirements: holes(200, 300),
      skus: [booster, display],
    });
    const nDisplay =
      plan.mixed.items.find((i) => i.slug === "display")?.quantity ?? 0;
    const nBooster =
      plan.mixed.items.find((i) => i.slug === "booster")?.quantity ?? 0;
    expect(nDisplay).toBeGreaterThan(0);
    expect(nBooster).toBeLessThan(24);
    /* Le total mixte reste ≤ au plan non consolidé (et ≤ singles). */
    expect(plan.mixed.totalCents).toBeLessThan(plan.singles.totalCents);
  });

  it("mixte : display plus cher que 24 boosters → jamais pris", () => {
    const hit = hitMap(200, 12 / 200);
    const booster = pack({ slug: "booster", priceCents: 450, hit });
    const display = pack({
      slug: "display",
      priceCents: 24 * 450 + 1,
      packs: 24,
      hit,
    });
    const plan = solveBuyPlan({
      requirements: holes(200, 300),
      skus: [booster, display],
    });
    expect(plan.mixed.items.find((i) => i.slug === "display")).toBeUndefined();
  });

  it("mixte : ne s'emballe pas en boîtes quand le rendement tombe", () => {
    /* 204 cartes, 12/sachet, rares à 1/12 sachet : fin de set lente. */
    const hit = new Map<string, number>();
    for (let i = 0; i < 180; i++) hit.set(`c${i}`, 12 / 180);
    for (let i = 180; i < 204; i++) hit.set(`c${i}`, 1 / 24);
    const booster = pack({ slug: "booster", priceCents: 450, hit });
    const display = pack({ slug: "display", priceCents: 9000, packs: 24, hit });
    const trove = pack({ slug: "trove", priceCents: 5000, packs: 9, hit });
    const plan = solveBuyPlan({
      requirements: holes(204, 100),
      skus: [booster, display, trove],
    });
    const packs = plan.mixed.items.reduce((s, i) => {
      const sku = [booster, display, trove].find((x) => x.slug === i.slug)!;
      return s + i.quantity * sku.packs;
    }, 0);
    /* Pas 12 displays : le rendement par sachet passe sous 0,5 bien avant. */
    expect(packs).toBeLessThan(12 * 24);
    expect(packs).toBeGreaterThan(0);
    /* Le coût de consolidation est le moindre coût pour ≥ ces sachets. */
    expect(plan.mixed.sealedCents).toBeLessThanOrEqual(packs * 450);
  });
});

describe("mixte : panier efficace, recommandation selon les cotes", () => {
  it("cotes faibles : panier efficace chiffré avec son reste, singles conseillé", () => {
    const hit = hitMap(200, 12 / 200);
    const booster = pack({ slug: "booster", priceCents: 450, hit });
    const plan = solveBuyPlan({
      requirements: holes(200, 10),
      skus: [booster],
    });
    expect(plan.mixed.items.length).toBeGreaterThan(0);
    expect(plan.mixed.expectedCompletion).toBeGreaterThan(0.5);
    expect(plan.mixed.totalCents).toBeGreaterThan(plan.singles.totalCents);
    expect(plan.recommendation.track).toBe("singles");
  });

  it("le panier scellé ne dépend pas des cotes ; la recommandation, si", () => {
    const hit = hitMap(200, 12 / 200);
    const booster = pack({ slug: "booster", priceCents: 450, hit });
    const cheap = solveBuyPlan({
      requirements: holes(200, 10),
      skus: [booster],
    });
    const dear = solveBuyPlan({
      requirements: holes(200, 500),
      skus: [booster],
    });
    expect(cheap.mixed.items).toEqual(dear.mixed.items);
    expect(cheap.recommendation.track).toBe("singles");
    expect(dear.recommendation.track).toBe("mixed");
  });
});
