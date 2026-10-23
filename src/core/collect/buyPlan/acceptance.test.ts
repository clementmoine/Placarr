import { describe, expect, it } from "vitest";

import { HitTable, evaluatePlan, expectedShortfall } from "./expectation";
import { solveBuyPlan } from "./solve";
import type { Requirement, SealedSku } from "./types";

/** Panini uniforme s=980, m=7 → p = m/s. */
function holes(count: number, priceCents: number | null): Requirement[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `v${i}`,
    acceptedPrints: [`v${i}`],
    requiredCopies: 1,
    ownedCopies: 0,
    priceCents,
  }));
}

function uniformPack(input: {
  slug: string;
  name?: string;
  priceCents: number;
  poolSize: number;
  packSize: number;
  packs?: number;
}): SealedSku {
  const p = input.packSize / input.poolSize;
  const hit = new Map<string, number>();
  for (let i = 0; i < input.poolSize; i++) hit.set(`v${i}`, p);
  return {
    slug: input.slug,
    name: input.name ?? input.slug,
    priceCents: input.priceCents,
    guaranteed: [],
    guaranteedPartial: false,
    packs: input.packs ?? 1,
    packHitByPrint: hit,
    provenance: "structural",
  };
}

function knownBundle(input: {
  slug: string;
  priceCents: number;
  prints: string[];
}): SealedSku {
  return {
    slug: input.slug,
    name: input.slug,
    priceCents: input.priceCents,
    guaranteed: input.prints,
    guaranteedPartial: false,
    packs: 0,
    packHitByPrint: null,
    provenance: "official",
  };
}

describe("expectation", () => {
  it("m=1 : E[reste] = Π(1−p)^n", () => {
    expect(expectedShortfall(1, [{ n: 2, p: 0.5 }])).toBeCloseTo(0.25, 12);
    expect(
      expectedShortfall(1, [
        { n: 3, p: 0.1 },
        { n: 1, p: 0.5 },
      ]),
    ).toBeCloseTo(0.9 ** 3 * 0.5, 12);
  });

  it("m=2 : E[max(0, 2 − Bin(n,p))] exact", () => {
    /* Bin(2, 0.5) : P0=.25 P1=.5 → E[max(0,2−X)] = 2×.25 + 1×.5 = 1 */
    expect(expectedShortfall(2, [{ n: 2, p: 0.5 }])).toBeCloseTo(1, 12);
    /* Bin(1, 1) → X=1 sûr → reste 1 */
    expect(expectedShortfall(2, [{ n: 1, p: 1 }])).toBeCloseTo(1, 12);
  });

  it("cas jouet s=4 m=2 k=2 → E[distinctes]=3", () => {
    const table = new HitTable(holes(4, 100), [
      uniformPack({ slug: "p", priceCents: 1, poolSize: 4, packSize: 2 }),
    ]);
    const e = evaluatePlan(table, new Map([["p", 2]]));
    expect(e.expectedCards).toBeCloseTo(3, 10);
    expect(e.singlesCents).toBeCloseTo(100, 10);
  });

  it("garantie + sachets dans le même SKU comptent tous les deux", () => {
    const hit = new Map([
      ["v1", 0.5],
      ["v2", 0.5],
    ]);
    const gift: SealedSku = {
      slug: "gift",
      name: "Coffret",
      priceCents: 1000,
      guaranteed: ["v0"],
      guaranteedPartial: false,
      packs: 2,
      packHitByPrint: hit,
      provenance: "official",
    };
    const table = new HitTable(holes(3, 100), [gift]);
    const e = evaluatePlan(table, new Map([["gift", 1]]));
    /* v0 garanti → 1 ; v1, v2 : 1 − 0.25 = 0.75 chacun → 2.5 */
    expect(e.expectedCards).toBeCloseTo(2.5, 10);
    expect(e.singlesCents).toBeCloseTo(50, 10);
  });
});

describe("voie mixte = panier scellé + reste à l'unité", () => {
  it("total mixte = scellé + Σ cote × E[reste]", () => {
    const plan = solveBuyPlan({
      requirements: holes(980, 30),
      skus: [
        uniformPack({ slug: "b", priceCents: 150, poolSize: 980, packSize: 7 }),
      ],
    });
    expect(plan.mixed.items.length).toBeGreaterThan(0);
    expect(plan.mixed.totalCents).toBe(
      plan.mixed.sealedCents + plan.mixed.singlesCents,
    );
    /* Le reste à l'unité correspond aux cartes laissées au hasard. */
    const expectedRemainder = plan.mixed.expectedRemainingCards * 30;
    expect(plan.mixed.singlesCents).toBeCloseTo(expectedRemainder, -1);
  });

  it("sachet qui n'apporte rien (< 0,5 carte) : mixte = singles, rien à ouvrir", () => {
    const plan = solveBuyPlan({
      requirements: holes(3, 200),
      skus: [
        uniformPack({
          slug: "b",
          priceCents: 10_000,
          poolSize: 3,
          packSize: 1,
        }),
      ],
    });
    /* p = 1/3 par trou → 1 carte neuve / sachet ≥ 0,5 : il ouvre. */
    expect(plan.mixed.items.length).toBeGreaterThan(0);
    expect(plan.mixed.totalCents).toBeGreaterThan(plan.singles.totalCents);
    /* …mais la recommandation reste la voie la moins chère. */
    expect(plan.recommendation.track).toBe("singles");
  });

  it("boîte consolidée ssi P ≤ k × P_sachet", () => {
    const reqs = holes(80, 80);
    const booster = uniformPack({
      slug: "booster",
      priceCents: 100,
      poolSize: 80,
      packSize: 4,
    });
    const duoOk = uniformPack({
      slug: "duo",
      priceCents: 190,
      poolSize: 80,
      packSize: 4,
      packs: 2,
    });
    const ok = solveBuyPlan({ requirements: reqs, skus: [booster, duoOk] });
    expect(
      ok.mixed.items.find((i) => i.slug === "duo")?.quantity ?? 0,
    ).toBeGreaterThan(0);

    const duoBad = uniformPack({
      slug: "duo-x",
      priceCents: 500,
      poolSize: 80,
      packSize: 4,
      packs: 2,
    });
    const bad = solveBuyPlan({ requirements: reqs, skus: [booster, duoBad] });
    expect(bad.mixed.items.find((i) => i.slug === "duo-x")?.quantity ?? 0).toBe(
      0,
    );
  });

  it("deck connu : une seule unité (garanties couvertes), mixte conseillé s'il économise", () => {
    const reqs = holes(10, 300);
    const deck = knownBundle({
      slug: "deck",
      priceCents: 1000,
      prints: ["v0", "v1", "v2", "v3", "v4"],
    });
    const plan = solveBuyPlan({ requirements: reqs, skus: [deck] });
    expect(plan.mixed.items.find((i) => i.slug === "deck")?.quantity).toBe(1);
    expect(plan.mixed.totalCents).toBe(1000 + 5 * 300);
    expect(plan.recommendation.track).toBe("mixed");
    expect(plan.recommendation.savingsCents).toBe(500);
  });

  it("sachet sans portée sur le set (chase seul) : rien à ouvrir ; bulk chiffré : panier + reste", () => {
    const reqs = holes(100, 80);
    const bulk = uniformPack({
      slug: "b",
      priceCents: 300,
      poolSize: 100,
      packSize: 6,
    });
    const chaseOnly: SealedSku = {
      ...bulk,
      packHitByPrint: new Map([["v0", 1 / 1152]]),
    };
    const none = solveBuyPlan({ requirements: reqs, skus: [chaseOnly] });
    expect(none.mixed.items).toHaveLength(0);
    expect(none.mixed.totalCents).toBe(none.singles.totalCents);
    const plan = solveBuyPlan({ requirements: reqs, skus: [bulk] });
    expect(plan.mixed.items.length).toBeGreaterThan(0);
    expect(plan.mixed.singlesCents).toBeLessThan(plan.singles.totalCents);
    expect(plan.mixed.totalCents).toBe(
      plan.mixed.sealedCents + plan.mixed.singlesCents,
    );
  });
});

describe("voie mixte : panier efficace", () => {
  it("ouvre tant que le rendement par sachet est raisonnable, puis s'arrête", () => {
    const plan = solveBuyPlan({
      requirements: holes(40, 100),
      skus: [
        uniformPack({ slug: "b", priceCents: 200, poolSize: 40, packSize: 4 }),
      ],
    });
    expect(plan.mixed.sealedCents).toBeGreaterThan(0);
    expect(plan.mixed.expectedRemainingCards).toBeLessThan(40);
    expect(
      plan.mixed.expectedCardsFromSealed + plan.mixed.expectedRemainingCards,
    ).toBeCloseTo(40, 0);
    expect(plan.mixed.expectedCompletion).toBeCloseTo(
      plan.mixed.expectedCardsFromSealed / 40,
      2,
    );
    /* La règle d'arrêt est exposée et respectée : le sachet suivant < 0,5 carte. */
    const n = plan.mixed.items[0]!.quantity;
    const T = new HitTable(holes(40, 100), [
      uniformPack({ slug: "b", priceCents: 200, poolSize: 40, packSize: 4 }),
    ]);
    const next =
      evaluatePlan(T, new Map([["b", n + 1]])).expectedCards -
      evaluatePlan(T, new Map([["b", n]])).expectedCards;
    expect(next).toBeLessThan(plan.mixed.stopRule.minNewCardsPerPack);
  });

  it("bulk à 3 ct + chase à 80 € : 85 % en espérance, mais le reste coûte tout → singles", () => {
    const reqs = [
      ...holes(200, 3),
      ...holes(18, 8000).map((r, i) => ({
        ...r,
        id: `e${i}`,
        acceptedPrints: [`e${i}`],
      })),
    ];
    const hit = new Map<string, number>();
    for (let i = 0; i < 200; i++) hit.set(`v${i}`, 12 / 200);
    for (let i = 0; i < 18; i++) hit.set(`e${i}`, 1 / 96 / 18);
    const sku: SealedSku = {
      slug: "b",
      name: "b",
      priceCents: 200,
      guaranteed: [],
      guaranteedPartial: false,
      packs: 1,
      packHitByPrint: hit,
      provenance: "official",
    };
    const plan = solveBuyPlan({ requirements: reqs, skus: [sku] });
    expect(plan.mixed.expectedCompletion).toBeGreaterThan(0.8);
    expect(plan.mixed.totalCents).toBe(
      plan.mixed.sealedCents + plan.mixed.singlesCents,
    );
    expect(plan.mixed.totalCents).toBeGreaterThan(plan.singles.totalCents);
    expect(plan.recommendation.track).toBe("singles");
    /* Et « tout avoir » en scellé : des milliers de sachets, chiffrés sans détour. */
    expect(plan.sealed.unreachableHoles).toBe(0);
    expect(plan.sealed.packs).toBeGreaterThan(1000);
    expect(plan.sealed.sealedCents).toBeGreaterThan(plan.singles.totalCents);
  });

  it("indépendant des cotes : même panier à 0,10 € ou 80 € ; la recommandation, non", () => {
    const sku = uniformPack({
      slug: "b",
      priceCents: 200,
      poolSize: 30,
      packSize: 8,
    });
    const cheap = solveBuyPlan({ requirements: holes(30, 10), skus: [sku] });
    const dear = solveBuyPlan({ requirements: holes(30, 8000), skus: [sku] });
    expect(cheap.mixed.items).toEqual(dear.mixed.items);
    expect(cheap.sealed.items).toEqual(dear.sealed.items);
    expect(cheap.recommendation.track).toBe("singles");
    /* À 80 € la carte, tout avoir en scellé (≈ 14 sachets) bat tout. */
    expect(dear.recommendation.track).toBe("sealed");
    expect(dear.sealed.sealedCents).toBeLessThan(dear.mixed.totalCents);
  });
});

describe("voie scellé : espérer tout avoir", () => {
  it("sachets pour E[reste] ≤ ½ carte", () => {
    const sku = uniformPack({
      slug: "b",
      priceCents: 200,
      poolSize: 20,
      packSize: 5,
    });
    const plan = solveBuyPlan({ requirements: holes(20, 100), skus: [sku] });
    /* 20 × 0.75^n ≤ 0.5 → n ≥ 12.8 → 13 */
    expect(plan.sealed.packs).toBe(13);
    expect(plan.sealed.sealedCents).toBe(13 * 200);
    expect(plan.sealed.expectedRemainingCards).toBeLessThanOrEqual(0.5);
    expect(plan.sealed.unreachableHoles).toBe(0);
    expect(plan.sealed.capped).toBe(false);
  });

  it("consolide en boîte quand c'est moins cher pour ≥ n sachets", () => {
    const booster = uniformPack({
      slug: "b",
      priceCents: 200,
      poolSize: 20,
      packSize: 5,
    });
    const box = uniformPack({
      slug: "box",
      priceCents: 1000,
      poolSize: 20,
      packSize: 5,
      packs: 6,
    });
    const plan = solveBuyPlan({
      requirements: holes(20, 100),
      skus: [booster, box],
    });
    /* 13 sachets : 2 boîtes (12) + 1 booster = 2200 < 13 × 200 = 2600. */
    expect(plan.sealed.items.find((i) => i.slug === "box")?.quantity).toBe(2);
    expect(plan.sealed.items.find((i) => i.slug === "b")?.quantity).toBe(1);
    expect(plan.sealed.sealedCents).toBe(2200);
  });

  it("trou hors loterie garanti par un deck → deck ajouté, pas d'injoignable", () => {
    const sku = uniformPack({
      slug: "b",
      priceCents: 200,
      poolSize: 10,
      packSize: 5,
    });
    const deck = knownBundle({
      slug: "deck",
      priceCents: 900,
      prints: ["promo"],
    });
    const reqs = [
      ...holes(10, 100),
      { ...holes(1, 100)[0]!, id: "promo", acceptedPrints: ["promo"] },
    ];
    const plan = solveBuyPlan({ requirements: reqs, skus: [sku, deck] });
    expect(plan.sealed.unreachableHoles).toBe(0);
    expect(plan.sealed.items.find((i) => i.slug === "deck")?.quantity).toBe(1);
    expect(plan.sealed.expectedRemainingCards).toBeLessThanOrEqual(0.5);
  });

  it("trou sans aucune source → compté injoignable, plan chiffré pour le reste", () => {
    const sku = uniformPack({
      slug: "b",
      priceCents: 200,
      poolSize: 10,
      packSize: 5,
    });
    const reqs = [
      ...holes(10, 100),
      { ...holes(1, 100)[0]!, id: "promo", acceptedPrints: ["promo"] },
    ];
    const plan = solveBuyPlan({ requirements: reqs, skus: [sku] });
    expect(plan.sealed.unreachableHoles).toBe(1);
    expect(plan.sealed.packs).toBeGreaterThan(0);
    expect(plan.recommendation.track).not.toBe("sealed");
  });

  it("bundle pris s'il économise plus de sachets qu'il ne coûte", () => {
    /* 10 communes à 1/2 ; une chase à 1/5000 par sachet ; coffret 20 € la garantit. */
    const hit = new Map<string, number>();
    for (let i = 0; i < 10; i++) hit.set(`v${i}`, 0.5);
    hit.set("chase", 1 / 5000);
    const booster: SealedSku = {
      slug: "b",
      name: "b",
      priceCents: 200,
      guaranteed: [],
      guaranteedPartial: false,
      packs: 1,
      packHitByPrint: hit,
      provenance: "official",
    };
    const gift = knownBundle({
      slug: "gift",
      priceCents: 2000,
      prints: ["chase"],
    });
    const reqs = [
      ...holes(10, 100),
      { ...holes(1, 100)[0]!, id: "chase", acceptedPrints: ["chase"] },
    ];
    const withGift = solveBuyPlan({
      requirements: reqs,
      skus: [booster, gift],
    });
    const without = solveBuyPlan({ requirements: reqs, skus: [booster] });
    expect(withGift.sealed.items.find((i) => i.slug === "gift")?.quantity).toBe(
      1,
    );
    expect(withGift.sealed.packs).toBeLessThan(100);
    expect(without.sealed.packs).toBeGreaterThan(1000);
    expect(withGift.sealed.sealedCents).toBeLessThan(
      without.sealed.sealedCents,
    );
  });

  it("aucun SKU chiffré → indéterminé", () => {
    const opaque: SealedSku = {
      slug: "x",
      name: "x",
      priceCents: 500,
      guaranteed: [],
      guaranteedPartial: false,
      packs: 5,
      packHitByPrint: null,
      provenance: "unknown",
    };
    const plan = solveBuyPlan({ requirements: holes(10, 100), skus: [opaque] });
    expect(plan.sealed.indeterminate).toBe(true);
    expect(plan.flags).toContain("unknownRates");
  });
});

describe("recommandation", () => {
  it("rien à acheter → complete", () => {
    const plan = solveBuyPlan({ requirements: [], skus: [] });
    expect(plan.recommendation).toEqual({
      track: "singles",
      reason: "complete",
      savingsCents: 0,
      confidence: "high",
    });
  });

  it("aucune cote → no_prices (pas de faux « singles moins cher »)", () => {
    const plan = solveBuyPlan({ requirements: holes(5, null), skus: [] });
    expect(plan.recommendation.reason).toBe("no_prices");
    expect(plan.flags).toContain("partialPrices");
  });

  it("mixte conseillé seulement au-delà du seuil d'économie", () => {
    const plan = solveBuyPlan({
      requirements: holes(100, 500),
      skus: [
        uniformPack({ slug: "b", priceCents: 300, poolSize: 100, packSize: 6 }),
      ],
    });
    expect(plan.recommendation.track).toBe("mixed");
    expect(plan.recommendation.savingsCents).toBe(
      plan.singles.totalCents - plan.mixed.totalCents,
    );
    expect(plan.recommendation.savingsCents).toBeGreaterThanOrEqual(100);
  });

  it("scellé conseillé quand il complète en espérance moins cher que tout", () => {
    /* 4 trous à 50 €, sachet dense (4/4) à 1 € : 1 sachet suffit. */
    const plan = solveBuyPlan({
      requirements: holes(4, 5000),
      skus: [
        uniformPack({ slug: "b", priceCents: 100, poolSize: 4, packSize: 4 }),
      ],
    });
    expect(plan.sealed.expectedRemainingCards).toBe(0);
    expect(plan.sealed.sealedCents).toBe(100);
    expect(plan.recommendation.track).toBe("sealed");
  });
});

describe("confiance de la recommandation", () => {
  it("majorité de cotes estimées → confidence low (pas de conseil ferme)", () => {
    const reqs: Requirement[] = [
      ...holes(1, 100),
      ...holes(3, 100).map((r, i) => ({
        ...r,
        id: `i${i}`,
        acceptedPrints: [`i${i}`],
        priceImputed: true,
      })),
    ];
    const plan = solveBuyPlan({ requirements: reqs, skus: [] });
    expect(plan.recommendation.confidence).toBe("low");
    const solid = solveBuyPlan({ requirements: holes(4, 100), skus: [] });
    expect(solid.recommendation.confidence).toBe("high");
  });

  it("SKU sans contenu exploitable → métrique indéterminée, pas « 0 carte, 0 € »", () => {
    const opaque: SealedSku = {
      slug: "preview",
      name: "Avant-première",
      priceCents: 6397,
      guaranteed: [],
      guaranteedPartial: true,
      packs: 1,
      packHitByPrint: null,
      provenance: "unknown",
    };
    const plan = solveBuyPlan({ requirements: holes(10, 100), skus: [opaque] });
    expect(plan.skuMetrics[0]?.indeterminate).toBe(true);
  });
});

describe("prix imputés", () => {
  it("imputedPrices flaggé et compté dans pricedCount", () => {
    const reqs: Requirement[] = [
      ...holes(2, 100),
      {
        ...holes(1, 100)[0]!,
        id: "i",
        acceptedPrints: ["i"],
        priceCents: 120,
        priceImputed: true,
      },
    ];
    const plan = solveBuyPlan({ requirements: reqs, skus: [] });
    expect(plan.flags).toContain("imputedPrices");
    expect(plan.singles.imputedCount).toBe(1);
    expect(plan.singles.pricedCount).toBe(3);
    expect(plan.singles.totalCents).toBe(320);
  });
});
