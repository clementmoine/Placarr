/*
  Le contrat de la check-list distingue deux familles de produits, et c'est
  cette distinction qui décide de ce qu'on a le droit de promettre : un deck
  donne un chiffre, un booster une espérance. Les mélanger reviendrait à
  afficher une prédiction là où on n'a qu'une moyenne.
*/
import { describe, expect, it } from "vitest";

import {
  attachCompetitivePriceCaps,
  boostersToExpectNearComplete,
  buyOptionsForMissing,
  buyProductsForSet,
  dedupeBuyProductsForAdvice,
  expectedNewCards,
  packSizeFromName,
  packsOpenedForProduct,
  planSetCompletion,
  projectBuyProductForSet,
  projectBuyProductsBySet,
  sealedSourcesByPrint,
  sealedRentabilityLevel,
  sealedUnitsForPacks,
  sealedYieldByProgress,
  singlesCostBreakdown,
  withContainerPackSizes,
} from "./buyAdvice";

describe("Pequignot Panini 2026 (s=980, m=7)", () => {
  const s = 980;
  const m = 7;

  it("matches the PDF progression table for E[distinct]", () => {
    /*
      Note Yann Pequignot — tableau p.6 :
      k sachets → distinctes / manquantes (arrondis publiés).
    */
    const distinct = (k: number) => s * (1 - (1 - m / s) ** k);
    expect(distinct(140)).toBeCloseTo(621, 0);
    expect(distinct(300)).toBeCloseTo(866, 0);
    expect(distinct(500)).toBeCloseTo(953, 0);
    expect(distinct(700)).toBeCloseTo(974, 0);
    expect(distinct(965)).toBeCloseTo(979, 0);
  });

  it("matches expectedNewCards to u(1-(1-m/s)^k) on remaining holes", () => {
    // Album vide, 140 sachets → ~621 neuves (PDF ≈ 621).
    expect(
      expectedNewCards({
        packSize: m,
        poolSize: s,
        missing: s,
        packsOpened: 140,
      }),
    ).toBeCloseTo(621, 0);
    // Après ~621 collées : 359 trous, encore 160 sachets → progresse comme la table.
    expect(
      expectedNewCards({
        packSize: m,
        poolSize: s,
        missing: 359,
        packsOpened: 160,
      }),
    ).toBeCloseTo(245, 0); // 866-621
  });

  it("hits E[missing]<1 near the PDF ~965 packs (exact log, not s/m·ln s)", () => {
    /*
      PDF approx k > (s/m) ln s ≈ 964. Notre forme exacte
      u(1-m/s)^k < 1 donne ceil un peu plus bas (~961) — acceptable.
    */
    const k = boostersToExpectNearComplete({
      missing: s,
      poolSize: s,
      packSize: m,
    });
    expect(k).toBeGreaterThanOrEqual(960);
    expect(k).toBeLessThanOrEqual(966);
    const missingAt = (packs: number) => s * (1 - m / s) ** packs;
    expect(missingAt(k!)).toBeLessThan(1);
    expect(missingAt(k! - 1)).toBeGreaterThanOrEqual(1);
  });

  it("does not treat a 100-pack TCG case like a Panini unique box", () => {
    /*
      PDF : boîte 700 distincts → E = 700 en un achat.
      100 sachets indépendants de 7 → ~501 distincts, pas 700.
    */
    expect(
      expectedNewCards({
        packSize: m,
        poolSize: s,
        missing: s,
        packsOpened: 100,
      }),
    ).toBeCloseTo(501.5, 1);
    expect(
      expectedNewCards({
        packSize: 700,
        poolSize: s,
        missing: s,
        packsOpened: 1,
      }),
    ).toBe(700);
  });
});

describe("boostersToExpectNearComplete", () => {
  it("matches the Panini near-complete threshold for a mid set", () => {
    // 66 manquantes / 182 / booster 8 → 94 sachets pour E[restant] < 1.
    expect(
      boostersToExpectNearComplete({
        missing: 66,
        poolSize: 182,
        packSize: 8,
      }),
    ).toBe(94);
  });

  it("is far above the naive missing÷per-pack linear split", () => {
    const panini = boostersToExpectNearComplete({
      missing: 66,
      poolSize: 182,
      packSize: 8,
    })!;
    const linear = Math.ceil(66 / (8 * (66 / 182)));
    expect(linear).toBe(23);
    expect(panini).toBeGreaterThan(linear * 3);
  });

  it("returns 0 when nothing is missing", () => {
    expect(
      boostersToExpectNearComplete({
        missing: 0,
        poolSize: 182,
        packSize: 8,
      }),
    ).toBe(0);
  });
});

describe("espérance de cartes neuves", () => {
  it("scales with how much of the pool is still missing", () => {
    // Tout manque : chaque carte tirée est neuve.
    expect(
      expectedNewCards({ packSize: 10, poolSize: 100, missing: 100 }),
    ).toBe(10);
    // La moitié manque : la moitié du paquet.
    expect(expectedNewCards({ packSize: 10, poolSize: 100, missing: 50 })).toBe(
      5,
    );
    // Presque rien ne manque : le paquet n'apporte presque rien.
    expect(expectedNewCards({ packSize: 10, poolSize: 100, missing: 1 })).toBe(
      0.1,
    );
  });

  /*
    C'est le point qui rend l'espérance honnête : elle décroît à mesure que la
    collection se remplit. Les premières boîtes apportent beaucoup, les
    dernières presque rien.
  */
  it("never promises more new cards than there are missing", () => {
    expect(expectedNewCards({ packSize: 36, poolSize: 10, missing: 2 })).toBe(
      2,
    );
  });

  it("promises nothing when there is nothing to promise", () => {
    expect(expectedNewCards({ packSize: 0, poolSize: 100, missing: 50 })).toBe(
      0,
    );
    expect(expectedNewCards({ packSize: 10, poolSize: 100, missing: 0 })).toBe(
      0,
    );
    expect(expectedNewCards({ packSize: 10, poolSize: 0, missing: 5 })).toBe(0);
  });

  it("uses curated packsPerHit instead of uniform when rates exist", () => {
    // 12 Enchanted précises à 1152 packs → ~0.01 neuve / booster, pas 0.7.
    const keys = Array.from({ length: 12 }, (_, i) => `enc${i}`);
    const rates = new Map(keys.map((key) => [key, 1152]));
    expect(
      expectedNewCards({
        packSize: 12,
        poolSize: 220,
        missing: 12,
        missingKeys: keys,
        packsPerHitByPrint: rates,
      }),
    ).toBe(0);
  });

  it("caps optimistic rates at cards physically opened", () => {
    // Taux absurdes (1 sachet / print) × 200 manquantes > 12 cartes du booster.
    const keys = Array.from({ length: 200 }, (_, i) => `c${i}`);
    const rates = new Map(keys.map((key) => [key, 1]));
    expect(
      expectedNewCards({
        packSize: 12,
        poolSize: 220,
        missing: 200,
        missingKeys: keys,
        packsPerHitByPrint: rates,
        packsOpened: 1,
      }),
    ).toBe(12);
  });
});

describe("boostersToExpectNearComplete with rates", () => {
  it("is far above the uniform Panini figure for Enchanted chase", () => {
    const uniform = boostersToExpectNearComplete({
      missing: 12,
      poolSize: 220,
      packSize: 12,
    })!;
    const withRates = boostersToExpectNearComplete({
      missing: 12,
      poolSize: 220,
      packSize: 12,
      packsPerHitForMissing: Array.from({ length: 12 }, () => 1152),
    })!;
    expect(uniform).toBeLessThan(100);
    expect(withRates).toBeGreaterThan(2000);
  });
});

describe("comparer les options d'achat", () => {
  const missing = new Set(["a", "b", "c", "d"]);

  it("collapses recto/verso SKUs of the same booster into one option", () => {
    const options = buyOptionsForMissing({
      missing: new Set(Array.from({ length: 134 }, (_, i) => `c${i}`)),
      poolSize: 134,
      preferredLanguage: "fr",
      products: [
        {
          slug: "part1-booster-1188",
          name: "Part 1 — Booster",
          kind: "booster",
          behavior: "random_pack",
          setId: "part1",
          language: "fr",
          packSize: 8,
          imageUrl: "/assets/a.jpg",
        },
        {
          slug: "part1-booster-1189",
          name: "Part 1 - Booster",
          kind: "booster",
          behavior: "random_pack",
          setId: "part1",
          language: "fr",
          packSize: 8,
          imageUrl: "/assets/b.jpg",
        },
      ],
    });
    expect(options).toHaveLength(1);
    expect(options[0]?.slug).toBe("part1-booster-1188");
    expect(dedupeBuyProductsForAdvice([
      {
        slug: "part1-booster-1189",
        name: "Part 1 — Booster",
        kind: "booster",
        behavior: "random_pack",
        setId: "part1",
        language: "fr",
        packSize: 8,
        priceCents: 500,
      },
      {
        slug: "part1-booster-1188",
        name: "Part 1 — Booster",
        kind: "booster",
        behavior: "random_pack",
        setId: "part1",
        language: "fr",
        packSize: 8,
      },
    ])[0]?.slug).toBe("part1-booster-1189");
  });

  it("skips ephemera / no_cards products (détecteur, poster)", () => {
    const options = buyOptionsForMissing({
      missing: new Set(["a", "b"]),
      poolSize: 10,
      preferredLanguage: "fr",
      products: [
        {
          slug: "part4-d-tecteur-253",
          name: "Part 4 — Détecteur",
          kind: "ephemera",
          behavior: "no_cards" as "known_bundle",
          setId: "part4",
          language: "fr",
        },
        {
          slug: "part4-booster",
          name: "Part 4 — Booster",
          kind: "booster",
          behavior: "random_pack",
          setId: "part4",
          language: "fr",
          packSize: 8,
        },
      ],
    });
    expect(options.map((o) => o.slug)).toEqual(["part4-booster"]);
  });

  it("counts a known bundle exactly, and says so", () => {
    const [option] = buyOptionsForMissing({
      missing,
      poolSize: 100,
      products: [
        {
          slug: "deck",
          name: "Deck",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["a", "b", "z"],
          cardCount: 3,
        },
      ],
    });
    expect(option.newCards).toBe(2);
    expect(option.certainty).toBe("exact");
  });

  /*
    Un aperçu de quinze tuiles sur un pool de 452 n'est pas un contenu : le
    prendre pour tel ferait annoncer « ce booster contient exactement ces
    quinze cartes », ce que le site lui-même ne dit pas.

    Sur un paquet **aléatoire**, l'aperçu ne vaut même pas comme plancher : les
    cartes montrées ne sont pas celles qu'on tirera.
  */
  it("refuses to read a preview as the real contents", () => {
    const [option] = buyOptionsForMissing({
      missing,
      poolSize: 100,
      products: [
        {
          slug: "booster",
          name: "Booster 10 cartes",
          kind: "booster",
          behavior: "random_pack",
          prints: ["a", "b", "c"],
          printsArePreview: true,
          packSize: 10,
        },
      ],
    });
    expect(option.certainty).toBe("expected");
    expect(option.newCards).toBeLessThan(3);
  });

  /*
    Premier Chapitre fin de set : 12 Enchanted manquantes, blister carton à 5 €
    avec aperçu boutique = les 12 Enchanted + bulk. Compter l'aperçu comme
    contenu fixe affichait « +12 · au moins » à 0,42 €/carte.
  */
  it("does not floor a blister carton on shop preview tiles (Lorcana chase)", () => {
    const enchanted = Array.from({ length: 12 }, (_, i) => `lorcana:1-${205 + i}`);
    const [option] = buyOptionsForMissing({
      missing: new Set(enchanted),
      poolSize: 216,
      products: [
        {
          slug: "booster-blister-carton-premier-chapitre-mickey",
          name: "Booster Blister Carton Premier Chapitre - Mickey",
          kind: "blister",
          behavior: "pack_container",
          prints: [...enchanted, "lorcana:1-21", "lorcana:1-18", "lorcana:1-147"],
          printsArePreview: true,
          packSize: 12,
          packsInContainer: 1,
          cardCount: 420,
          priceCents: 500,
        },
      ],
    });
    expect(option.certainty).toBe("expected");
    expect(option.newCards).toBeLessThan(2);
    expect(option.centsPerNewCard == null || option.centsPerNewCard > 200).toBe(
      true,
    );
  });

  it("ranks Hyperia display above trove; never floors trove on 15 preview tiles", () => {
    const missing = new Set(
      Array.from({ length: 253 }, (_, i) => `lorcana:14-${i + 1}`),
    );
    const options = buyOptionsForMissing({
      missing,
      poolSize: 253,
      products: [
        {
          slug: "display-24-boosters-set-14-hyperia-city",
          name: "Boîte de 24 boosters Set 14 - Hyperia City",
          kind: "display",
          behavior: "pack_container",
          prints: Array.from({ length: 15 }, (_, i) => `lorcana:14-${i + 1}`),
          printsArePreview: true,
          packSize: 12,
          packsInContainer: 24,
          priceCents: 9990,
        },
        {
          slug: "coffret-tresor-des-illumineurs-set-14-hyperia-city",
          name: "Trésor des Illumineurs Set 14 - Hyperia City",
          kind: "trove",
          behavior: "mixed_bundle",
          prints: Array.from({ length: 15 }, (_, i) => `lorcana:14-${i + 1}`),
          printsArePreview: true,
          packSize: 12,
          packsInContainer: 8,
          priceCents: 4400,
        },
        {
          slug: "pack-avant-premiere-set-14-hyperia-city",
          name: "Pack Avant-Première Set 13 - Hyperia City",
          kind: "prerelease",
          behavior: "mixed_bundle",
          prints: Array.from({ length: 15 }, (_, i) => `lorcana:14-${i + 1}`),
          printsArePreview: true,
          priceCents: 6397,
        },
      ],
    });
    const display = options.find((o) => o.slug.includes("display-24"));
    expect(display).toBeDefined();
    expect(display?.certainty).toBe("expected");
    expect(display?.newCards).toBeGreaterThan(50);
    const trove = options.find((o) => o.slug.includes("tresor"));
    expect(trove?.certainty).toBe("expected");
    expect(trove?.newCards).toBeGreaterThan(15);
    expect(trove?.newCards).not.toBe(15);
    const prerelease = options.find((o) => o.slug.includes("avant-premiere"));
    // No pack model → not a useful option (UI hides newCards 0).
    expect(prerelease?.newCards ?? 0).toBe(0);
  });

  /*
    Le classement se fait sur le coût par carte neuve, pas sur le nombre : un
    display à cent euros qui apporte trente cartes est un moins bon achat qu'un
    deck à cinq euros qui en apporte dix.
  */
  it("ranks by cost per new card, not by how many cards", () => {
    const options = buyOptionsForMissing({
      missing: new Set(Array.from({ length: 40 }, (_, i) => `c${i}`)),
      poolSize: 40,
      products: [
        {
          slug: "display",
          name: "Display",
          kind: "display",
          behavior: "known_bundle",
          prints: Array.from({ length: 30 }, (_, i) => `c${i}`),
          priceCents: 10000,
        },
        {
          slug: "deck",
          name: "Deck",
          kind: "deck",
          behavior: "known_bundle",
          prints: Array.from({ length: 10 }, (_, i) => `c${i}`),
          priceCents: 500,
        },
      ],
    });
    expect(options[0].slug).toBe("deck");
    expect(options[0].centsPerNewCard).toBe(50);
    expect(options[1].centsPerNewCard).toBe(333);
  });

  it("at equal €/new card, ranks the option with more new cards first", () => {
    const options = buyOptionsForMissing({
      missing: new Set(Array.from({ length: 40 }, (_, i) => `c${i}`)),
      poolSize: 40,
      products: [
        {
          slug: "deck",
          name: "Deck",
          kind: "deck",
          behavior: "known_bundle",
          prints: Array.from({ length: 10 }, (_, i) => `c${i}`),
          priceCents: 250,
        },
        {
          slug: "trove",
          name: "Trove",
          kind: "trove",
          behavior: "known_bundle",
          prints: Array.from({ length: 30 }, (_, i) => `c${i}`),
          priceCents: 750,
        },
      ],
    });
    expect(options[0].centsPerNewCard).toBe(25);
    expect(options[1].centsPerNewCard).toBe(25);
    expect(options[0].slug).toBe("trove");
    expect(options[1].slug).toBe("deck");
  });

  it("keeps a priceless product in the list, at the end", () => {
    const options = buyOptionsForMissing({
      missing,
      poolSize: 10,
      products: [
        {
          slug: "sans-prix",
          name: "X",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["a", "b", "c", "d"],
        },
        {
          slug: "avec-prix",
          name: "Y",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["a"],
          priceCents: 100,
        },
      ],
    });
    expect(options.map((o) => o.slug)).toEqual(["avec-prix", "sans-prix"]);
    expect(options[1].centsPerNewCard).toBeNull();
  });

  it("drops a product that brings nothing to the bottom", () => {
    const options = buyOptionsForMissing({
      missing,
      poolSize: 10,
      products: [
        {
          slug: "rien",
          name: "Rien",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["z"],
          priceCents: 1,
        },
        {
          slug: "utile",
          name: "Utile",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["a"],
          priceCents: 10000,
        },
      ],
    });
    expect(options[0].slug).toBe("utile");
  });
});

/*
  Mesuré sur les prix collectés : médiane à deux centimes, maximum à deux mille
  euros. Compléter 95 % d'un set ne coûte presque rien, les 5 % restants
  coûtent tout. Un total seul serait donc trompeur — c'est la marche qu'il faut
  montrer.
*/
describe("la falaise des prix", () => {
  it("separates the cheap bulk from the few that cost everything", () => {
    const prices = [
      ...Array.from({ length: 90 }, () => 2),
      ...Array.from({ length: 10 }, () => 20000),
    ];
    const b = singlesCostBreakdown(prices);
    expect(b.priced).toBe(100);
    expect(b.cheapCount).toBe(90);
    expect(b.cheapCents).toBe(180);
    expect(b.expensiveCount).toBe(10);
    expect(b.expensiveCents).toBe(200000);
    expect(b.medianCents).toBe(2);
  });

  /** Une carte sans prix se compte, elle ne se devine pas à zéro. */
  it("counts what it cannot price instead of pretending it is free", () => {
    const b = singlesCostBreakdown([100, null, null]);
    expect(b.priced).toBe(1);
    expect(b.unpriced).toBe(2);
    expect(b.totalCents).toBe(100);
  });

  it("says nothing rather than zero when nothing is priced", () => {
    expect(singlesCostBreakdown([null, null]).medianCents).toBeNull();
  });
});

/*
  Le champ « nombre de cartes » d'un produit ne dit pas la même chose selon le
  produit, et le prendre au pied de la lettre faisait promettre n'importe quoi :
  un booster Lorcana annonce 452 cartes — la taille du set, pas du sachet — et
  l'espérance calculée dessus affirmait qu'il apportait d'un coup toutes les
  cartes manquantes.
*/
describe("attachCompetitivePriceCaps", () => {
  it("caps a display at packs × unit booster price (not €/new × EV)", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        priceCents: 200,
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
        packSize: 12,
        priceCents: 12600,
      },
      {
        slug: "trove",
        name: "Trove",
        kind: "trove",
        behavior: "mixed_bundle",
        packsInContainer: 8,
        packSize: 12,
        priceCents: 4000,
      },
    ]);
    const options = attachCompetitivePriceCaps(
      [
        {
          slug: "booster",
          name: "Booster",
          kind: "booster",
          newCards: 12,
          certainty: "expected",
          priceCents: 200,
          centsPerNewCard: 17,
          basis: "aléatoire",
        },
        {
          slug: "display",
          name: "Display",
          kind: "display",
          newCards: 100,
          certainty: "expected",
          priceCents: 12600,
          centsPerNewCard: 126,
          basis: "aléatoire",
        },
        {
          slug: "trove",
          name: "Trove",
          kind: "trove",
          newCards: 80,
          certainty: "expected",
          priceCents: 4000,
          centsPerNewCard: 50,
          basis: "aléatoire",
        },
      ],
      products,
    );
    expect(options.find((row) => row.slug === "booster")?.maxCompetitivePriceCents).toBeNull();
    // 24 × 2 € = 48 € — pas ~17 € via €/neuve × EV.
    expect(options.find((row) => row.slug === "display")?.maxCompetitivePriceCents).toBe(
      4800,
    );
    expect(options.find((row) => row.slug === "trove")?.maxCompetitivePriceCents).toBe(
      1600,
    );
  });

  it("wires pack-parity caps through buyOptionsForMissing", () => {
    const missing = new Set(Array.from({ length: 80 }, (_, i) => `c${i}`));
    const options = buyOptionsForMissing({
      missing,
      poolSize: 100,
      products: withContainerPackSizes([
        {
          slug: "booster",
          name: "Booster",
          kind: "booster",
          behavior: "random_pack",
          packSize: 12,
          priceCents: 200,
        },
        {
          slug: "display",
          name: "Display",
          kind: "display",
          behavior: "pack_container",
          packsInContainer: 24,
          packSize: 12,
          priceCents: 12600,
        },
      ]),
    });
    const display = options.find((row) => row.slug === "display");
    expect(display?.maxCompetitivePriceCents).toBe(4800);
  });
});

describe("ce que « nombre de cartes » veut dire", () => {
  const missing = new Set(Array.from({ length: 16 }, (_, i) => `c${i}`));

  it("reads the pack size out of the name the shop wrote", () => {
    expect(packSizeFromName("Booster 12 cartes Premier Chapitre")).toBe(12);
    expect(packSizeFromName("Blister 3 cartes")).toBe(3);
  });

  /** Au-delà de cent ce n'est plus un paquet : c'est le pool, dans le même champ. */
  it("refuses a count that is obviously a set, not a pack", () => {
    expect(packSizeFromName("Booster 452 cartes")).toBeNull();
    expect(packSizeFromName("Coffret Cadeau - Hadès & Mulan")).toBeNull();
  });

  it("estimates nothing for a random pack of unknown size", () => {
    const [option] = buyOptionsForMissing({
      missing,
      poolSize: 220,
      products: [
        {
          slug: "blister",
          name: "Booster Blister Carton",
          kind: "booster",
          behavior: "random_pack",
          cardCount: 420,
        },
      ],
    });
    expect(option.newCards).toBe(0);
    expect(option.certainty).toBe("unknown");
    expect(option.basis).toContain("taille du paquet");
  });

  /*
    **Un contenu fixe n'est pas un tirage au sort.** Un deck de démarrage
    contient toujours les mêmes cartes ; si nous n'en connaissons que quinze sur
    vingt-huit, l'inconnue est notre relevé, pas le produit.

    L'ancienne version lui appliquait la formule des paquets aléatoires et
    affichait « +1,7 » — une probabilité là où il n'y en a aucune. On rend
    désormais un **plancher** : ce que les cartes listées apportent, en disant
    combien manquent à l'appel.
  */
  it("floors a fixed bundle we only partly know, never averages it", () => {
    const [option] = buyOptionsForMissing({
      missing,
      poolSize: 220,
      products: [
        {
          slug: "deck",
          name: "Deck de démarrage",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["c0", "c1", "zzz"],
          printsArePreview: true,
          cardCount: 28,
        },
      ],
    });
    expect(option.certainty).toBe("atLeast");
    expect(option.newCards).toBe(2);
    expect(option.basis).toContain("3 des 28");
  });

  it("treats a known_bundle with contentsKnown as exact despite playset copies", () => {
    // Maître Hokage : 40 copies, 38 printKeys (2× Haku / Kaede / Kotetsu).
    const prints = Array.from({ length: 38 }, (_, i) => `naruto:ni-${i}`);
    const [option] = buyOptionsForMissing({
      missing: new Set([prints[0]!, prints[1]!, "other"]),
      poolSize: 183,
      products: [
        {
          slug: "starter-maitre-hokage",
          name: "Starter Maître Hokage",
          kind: "deck",
          behavior: "known_bundle",
          prints,
          cardCount: 40,
          contentsKnown: true,
        },
      ],
    });
    expect(option.certainty).toBe("exact");
    expect(option.newCards).toBe(2);
    expect(option.basis).toContain("38 tirages distincts");
  });

  /*
    Un contenu fixe dont on ne connaît **rien** ne se devine pas non plus. La
    réponse est entre zéro et tout ; ce n'est pas une distribution, c'est de
    l'ignorance, et un chiffre la déguiserait.
  */
  it("says nothing about a fixed bundle it knows nothing of", () => {
    const [option] = buyOptionsForMissing({
      missing,
      poolSize: 220,
      products: [
        {
          slug: "coffret",
          name: "Coffret Cadeau",
          kind: "coffret",
          behavior: "mixed_bundle",
          cardCount: 28,
        },
      ],
    });
    expect(option.certainty).toBe("unknown");
    expect(option.newCards).toBe(0);
    expect(option.basis).toContain("aucune carte listée");
  });

  it("treats mixed_bundle promo lists as a floor, not a full inventory", () => {
    const [option] = buyOptionsForMissing({
      missing,
      poolSize: 220,
      products: [
        {
          slug: "gift",
          name: "Coffret Cadeau Hades",
          kind: "coffret",
          behavior: "mixed_bundle",
          prints: ["c0", "zzz"],
          printsArePreview: false,
        },
      ],
    });
    expect(option.certainty).toBe("atLeast");
    expect(option.newCards).toBe(1);
    expect(option.basis).toContain("garanties");
  });

  it("adds random-pack expectation to mixed_bundle when packs are known (duopack)", () => {
    const missingKeys = Array.from({ length: 117 }, (_, i) => `c${i}`);
    const options = buyOptionsForMissing({
      missing: new Set([...missingKeys, "pr96"]),
      poolSize: 120,
      products: [
        {
          slug: "duopack",
          name: "Duopack 2 boosters + promo",
          kind: "coffret",
          behavior: "mixed_bundle",
          prints: ["pr96"],
          printsArePreview: false,
          packSize: 8,
          packsInContainer: 2,
        },
        {
          slug: "duopack-owned-promo",
          name: "Duopack promo already owned",
          kind: "coffret",
          behavior: "mixed_bundle",
          prints: ["owned-pr"],
          printsArePreview: false,
          packSize: 8,
          packsInContainer: 2,
        },
      ],
    });
    const withPromo = options.find((row) => row.slug === "duopack")!;
    const withoutPromo = options.find(
      (row) => row.slug === "duopack-owned-promo",
    )!;
    // 2×8 dans un pool quasi vide → ~15.6 neuves, +1 si la promo manque.
    expect(withPromo.certainty).toBe("expected");
    expect(withPromo.newCards).toBeGreaterThan(15);
    expect(withPromo.newCards).toBeLessThanOrEqual(17);
    expect(withoutPromo.newCards).toBeGreaterThan(14);
    expect(withoutPromo.newCards).toBeLessThan(withPromo.newCards);
    expect(withoutPromo.basis).toMatch(/2×8|2 sachets/);
  });
});

describe("projectBuyProductsBySet", () => {
  const tin = {
    slug: "tin-box",
    name: "Coffret Métal",
    kind: "coffret",
    behavior: "mixed_bundle" as const,
    setId: null,
    prints: ["naruto:ni-0156", "naruto:ni-0049", "naruto:pr-0016"],
    printsArePreview: false,
    packSize: 8,
    packsInContainer: 2,
    packsBySet: { s1: 1, s2: 1 },
    guaranteeSets: ["s4", "promo"],
  };

  const printSetIds = new Map([
    ["naruto:ni-0156", "s4"],
    // Reprint / mauvais rangement catalogue — ne doit PAS accrocher S5.
    ["naruto:ni-0049", "s5"],
    ["naruto:pr-0016", "promo"],
  ]);

  it("attaches a multi-set tin to each series it helps (not only a primary setId)", () => {
    const bySet = projectBuyProductsBySet({
      products: [tin],
      printSetIds,
    });
    expect([...bySet.keys()].sort()).toEqual(["promo", "s1", "s2", "s4"]);
    expect(bySet.get("s1")![0]).toMatchObject({
      slug: "tin-box",
      packsInContainer: 1,
      prints: [],
    });
    expect(bySet.get("s4")![0]).toMatchObject({
      packsInContainer: 0,
      prints: ["naruto:ni-0156"],
    });
    expect(bySet.get("promo")![0]).toMatchObject({
      packsInContainer: 0,
      prints: ["naruto:pr-0016"],
    });
    expect(bySet.get("s5")).toBeUndefined();
  });

  it("does not list Coffret Métal on S5 for a stray Invocation reprint", () => {
    expect(projectBuyProductForSet(tin, "s5", printSetIds)).toBeNull();
  });

  it("does not attach a multi-set gift box to Archazia via shop booster tiles", () => {
    const picsou = {
      slug: "coffret-cadeau-balthazar-picsou",
      name: "Coffret Cadeau - Balthazar Picsou",
      kind: "collector_box",
      behavior: "mixed_bundle" as const,
      setId: "10",
      prints: ["lorcana:10-36-p3"],
      printsArePreview: false,
      packsInContainer: 5,
      /* Après fix curated : pas de packsBySet inventé depuis les tuiles. */
      packsBySet: null as Record<string, number> | null,
      guaranteeSets: ["10"],
      packComposition: "none" as const,
      priceCents: 399,
    };
    const memberships = new Map([
      ["lorcana:10-36-p3", "10"],
    ]);
    expect(projectBuyProductForSet(picsou, "7", memberships)).toBeNull();
    expect(projectBuyProductForSet(picsou, "10", memberships)).toMatchObject({
      setId: "10",
      prints: ["lorcana:10-36-p3"],
      /* Sachets opaques : promo seulement, pas 5× loterie. */
      packsInContainer: 0,
    });
    /* Régression : l'ancien packsBySet {7:2,…} accrochait Archazia. */
    const legacyInvented = {
      ...picsou,
      packsBySet: { "6": 1, "7": 2, "8": 1, "10": 1 },
    };
    expect(projectBuyProductForSet(legacyInvented, "7", memberships)).toMatchObject({
      packsInContainer: 2,
      prints: [],
    });
  });

  it("does not treat Elsa gift box as 5 Fabled lottery packs", () => {
    const elsa = {
      slug: "coffret-cadeau-fabuleux-elsa",
      name: "Coffret Cadeau - Elsa",
      kind: "collector_box",
      behavior: "mixed_bundle" as const,
      setId: "9",
      prints: ["lorcana:5-6-p3"],
      printsArePreview: false,
      packsInContainer: 5,
      packsBySet: null as Record<string, number> | null,
      guaranteeSets: ["5"],
      packComposition: "none" as const,
      priceCents: 1500,
    };
    const memberships = new Map([["lorcana:5-6-p3", "5"]]);
    expect(projectBuyProductForSet(elsa, "9", memberships)).toBeNull();
    expect(projectBuyProductForSet(elsa, "5", memberships)).toMatchObject({
      setId: "5",
      prints: ["lorcana:5-6-p3"],
      packsInContainer: 0,
    });
  });

  it("does not recommend an S1 starter to complete S4 via shared reprints", () => {
    const starter = {
      slug: "starter-maitre-hokage",
      name: "Starter Maître Hokage",
      kind: "deck",
      behavior: "known_bundle" as const,
      setId: "s1",
      prints: [
        "naruto:ni-0009",
        "naruto:ni-0002",
        "naruto:cl-0004",
      ],
      printsArePreview: false,
    };
    const memberships = new Map<string, Set<string>>([
      ["naruto:ni-0009", new Set(["s1", "s4"])],
      ["naruto:ni-0002", new Set(["s1"])],
      ["naruto:cl-0004", new Set(["s1"])],
    ]);
    expect(projectBuyProductForSet(starter, "s4", memberships)).toBeNull();
    const bySet = projectBuyProductsBySet({
      products: [starter],
      printSetIds: memberships,
    });
    expect([...bySet.keys()]).toEqual(["s1"]);
  });

  it("keeps single-set products unchanged on their setId", () => {
    const projected = projectBuyProductForSet(
      {
        slug: "booster-s1",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        setId: "s1",
        packSize: 8,
        packsInContainer: 1,
      },
      "s1",
      printSetIds,
    );
    expect(projected).toMatchObject({
      setId: "s1",
      packsInContainer: 1,
    });
    expect(
      projectBuyProductForSet(
        {
          slug: "booster-s1",
          name: "Booster",
          kind: "booster",
          behavior: "random_pack",
          setId: "s1",
          packsInContainer: 1,
        },
        "s2",
        printSetIds,
      ),
    ).toBeNull();
  });

  it("dedupes chapter-branded quest SKUs onto the priced retail coffret", () => {
    const hunny = {
      slug: "coffret-quete-des-illumineurs-equipe-miel-a-la-rescousse",
      name: "Coffret Quête des Illumineurs - Équipe Miel à la Rescousse",
      kind: "quest",
      behavior: "mixed_bundle" as const,
      setId: "q3",
      language: "fr",
      cardCount: 190,
      priceCents: 4000,
      structureUnits: [
        { label: "Scenario deck (Vine)", count: 1, cardsEach: 50 },
        { label: "Ready-to-play decks", count: 2, cardsEach: 60 },
      ],
    };
    const vineChapter = {
      ...hunny,
      slug: "attack-of-the-vine-quest",
      name: "Invasion Epineuse",
      priceCents: null,
    };
    const palace = {
      slug: "coffret-quete-des-illumineurs-vol-au-palais",
      name: "Coffret Quête des Illumineurs - Vol au Palais",
      kind: "quest",
      behavior: "mixed_bundle" as const,
      setId: "q2",
      language: "fr",
      cardCount: 170,
      /** Residual boutique — ne doit pas empêcher la fusion avec le jumeau. */
      packSize: 39,
      priceCents: 2444,
      structureUnits: [
        { label: "Scenario deck (Jafar)", count: 1, cardsEach: 50 },
        { label: "Ready-to-play decks", count: 2, cardsEach: 60 },
      ],
    };
    const jafarChapter = {
      ...palace,
      slug: "reign-of-jafar-quest",
      name: "Le Règne de Jafar",
      packSize: null,
      priceCents: null,
    };
    const deduped = dedupeBuyProductsForAdvice([
      vineChapter,
      hunny,
      jafarChapter,
      palace,
    ]);
    expect(deduped.map((row) => row.slug).sort()).toEqual([
      "coffret-quete-des-illumineurs-equipe-miel-a-la-rescousse",
      "coffret-quete-des-illumineurs-vol-au-palais",
    ]);
    const options = buyOptionsForMissing({
      missing: new Set(["lorcana:q3-10"]),
      poolSize: 37,
      preferredLanguage: "fr",
      products: [vineChapter, hunny],
    });
    expect(options).toHaveLength(1);
    expect(options[0]?.slug).toBe(
      "coffret-quete-des-illumineurs-equipe-miel-a-la-rescousse",
    );
    expect(options[0]?.priceCents).toBe(4000);
  });

  it("matches quest setIds case-insensitively (Q3 ↔ q3)", () => {
    const quest = {
      slug: "great-hunny-rescue-quest-en",
      name: "Great Hunny Rescue",
      kind: "quest",
      behavior: "mixed_bundle" as const,
      setId: "Q3",
      cardCount: 190,
      structureUnits: [
        { label: "Ready-to-play decks", count: 2, cardsEach: 60 },
      ],
      contentsKnown: false,
      language: "en",
    };
    const projected = projectBuyProductForSet(quest, "q3", new Map());
    expect(projected?.setId).toBe("q3");
    const bySet = projectBuyProductsBySet({
      products: [quest],
      printSetIds: new Map(),
    });
    expect([...bySet.keys()]).toEqual(["q3"]);
    // Checklist set.id is `Q3` (sqlite set_code) — lookup must normalize.
    expect(buyProductsForSet(bySet, "Q3").map((row) => row.slug)).toEqual([
      "great-hunny-rescue-quest-en",
    ]);
    expect(buyProductsForSet(bySet, "Q3")).toEqual(
      buyProductsForSet(bySet, "q3"),
    );
    const [option] = buyOptionsForMissing({
      missing: new Set(["lorcana:q3-10"]),
      poolSize: 41,
      products: buyProductsForSet(bySet, "Q3"),
      preferredLanguage: "en",
    });
    expect(option?.structureAttested).toBe(true);
    expect(option?.newCards).toBe(0);
    expect(option?.certainty).toBe("unknown");
  });

  it("scores S1 advice with one tin booster, not both packs", () => {
    const projected = projectBuyProductForSet(tin, "s1", printSetIds)!;
    const missingKeys = Array.from({ length: 100 }, (_, i) => `naruto:s1-${i}`);
    const [option] = buyOptionsForMissing({
      missing: new Set(missingKeys),
      poolSize: 182,
      products: [projected],
    });
    expect(option.certainty).toBe("expected");
    expect(option.basis).toMatch(/1 sachet/);
    // 1×8 dans un pool à moitié vide → ~4.4, pas ~8.8 (2 sachets).
    expect(option.newCards).toBeGreaterThan(4);
    expect(option.newCards).toBeLessThan(5);
    const bothPacks = buyOptionsForMissing({
      missing: new Set(missingKeys),
      poolSize: 182,
      products: [{ ...tin, packsInContainer: 2, packsBySet: null, prints: [] }],
    })[0];
    expect(bothPacks.newCards).toBeGreaterThan(option.newCards);
  });
});

describe("withContainerPackSizes", () => {
  it("copies the booster's cards-per-pack onto a display that lacks one", () => {
    const box = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster 12 cartes",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
      },
      {
        slug: "display",
        name: "display",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
      },
    ]).find((p) => p.slug === "display");
    expect(box?.packSize).toBe(12);
    expect(box?.packsInContainer).toBe(24);
  });

  it("blister ×1 donates packSize but not packsInContainer=1 to a display", () => {
    const products = withContainerPackSizes([
      {
        slug: "blister",
        name: "Blister carton",
        kind: "blister",
        behavior: "pack_container",
        setId: "1",
        packSize: 12,
        packsInContainer: 1,
        language: "fr",
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        setId: "1",
        packsInContainer: 24,
        language: "fr",
      },
    ]);
    expect(products.find((p) => p.slug === "display")).toMatchObject({
      packSize: 12,
      packsInContainer: 24,
    });
  });

  it("fills packsInContainer from a same-set display sibling (Storm 3 FR)", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster-s28",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        setId: "s28",
        packSize: 8,
        language: "fr",
      },
      {
        slug: "display-s28",
        name: "Display EN",
        kind: "display",
        behavior: "pack_container",
        setId: "s28",
        packSize: 10,
        packsInContainer: 24,
        language: "en",
      },
      {
        slug: "display-s28-fr",
        name: "Display FR",
        kind: "display",
        behavior: "pack_container",
        setId: "s28",
        language: "fr",
      },
    ]);
    const fr = products.find((p) => p.slug === "display-s28-fr");
    expect(fr).toMatchObject({
      packSize: 8,
      packsInContainer: 24,
    });
  });

  it("does not copy packSize from another set's booster", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster-s1",
        name: "Booster S1",
        kind: "booster",
        behavior: "random_pack",
        setId: "s1",
        packSize: 8,
        language: "fr",
      },
      {
        slug: "display-s28-fr",
        name: "Display S28",
        kind: "display",
        behavior: "pack_container",
        setId: "s28",
        packsInContainer: 24,
        language: "fr",
      },
    ]);
    expect(
      products.find((p) => p.slug === "display-s28-fr")?.packSize,
    ).toBeUndefined();
  });
});

describe("packsOpenedForProduct", () => {
  it("refuses to pretend a display without packs is one booster", () => {
    expect(
      packsOpenedForProduct({
        slug: "display-s28-fr",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packSize: 8,
      }),
    ).toBeNull();
    expect(
      packsOpenedForProduct({
        slug: "display-s28-fr",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packSize: 8,
        packsInContainer: 24,
      }),
    ).toBe(24);
    expect(
      packsOpenedForProduct({
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 8,
        packsInContainer: 1,
      }),
    ).toBe(1);
  });
});

describe("sealedUnitsForPacks", () => {
  it("maps Panini-style box volume (100 packs → ceil k/100 boxes)", () => {
    expect(sealedUnitsForPacks(140, 100)).toBe(2);
    expect(sealedUnitsForPacks(100, 100)).toBe(1);
    expect(sealedUnitsForPacks(35, 24)).toBe(2);
  });

  it("keeps pack counts when the SKU is a single pack", () => {
    expect(sealedUnitsForPacks(35, 1)).toBe(35);
    expect(sealedUnitsForPacks(35, null)).toBe(35);
  });
});

describe("sealedYieldByProgress", () => {
  it("matches Panini one-pack yield: full at start, weak near the end", () => {
    const yieldCurve = sealedYieldByProgress({
      packSize: 7,
      poolSize: 980,
      packsOpened: 1,
      missingNow: 359,
    });
    expect(yieldCurve.atStart).toBe(7);
    expect(yieldCurve.atNow).toBeCloseTo(2.6, 1);
    // ~90 % : missing ≈ 98 → E[new] ≈ 0.7
    expect(yieldCurve.atLate).toBeLessThan(1);
    expect(yieldCurve.atLate).toBeGreaterThan(0);
    expect(yieldCurve.atStart).toBeGreaterThan(yieldCurve.atNow);
    expect(yieldCurve.atNow).toBeGreaterThan(yieldCurve.atLate);
    expect(yieldCurve.progressNow).toBeCloseTo(1 - 359 / 980, 5);
    expect(yieldCurve.samples.length).toBeGreaterThanOrEqual(5);
    expect(yieldCurve.samples[0]).toMatchObject({ progress: 0, expectedNew: 7 });
    expect(yieldCurve.samples.at(-1)).toMatchObject({
      progress: 1,
      expectedNew: 0,
    });
  });

  it("shows a display collapsing from start to late-set holes", () => {
    const yieldCurve = sealedYieldByProgress({
      packSize: 12,
      poolSize: 220,
      packsOpened: 24,
      missingNow: 12,
    });
    expect(yieldCurve.atStart).toBeGreaterThan(100);
    expect(yieldCurve.atNow).toBeLessThan(15);
    expect(yieldCurve.atStart).toBeGreaterThan(yieldCurve.atNow);
    expect(yieldCurve.progressNow).toBeCloseTo(1 - 12 / 220, 5);
  });

  it("keeps atNow equal to newCards on a scored booster option", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        priceCents: 400,
      },
    ]);
    const missing = new Set(
      Array.from({ length: 80 }, (_, i) => `c${i}`),
    );
    const option = buyOptionsForMissing({
      missing,
      poolSize: 100,
      products,
    }).find((row) => row.slug === "booster");
    expect(option?.certainty).toBe("expected");
    expect(option?.yieldByProgress).toBeDefined();
    expect(option!.yieldByProgress!.atNow).toBe(option!.newCards);
    expect(option!.yieldByProgress!.atStart).toBeGreaterThan(
      option!.yieldByProgress!.atNow,
    );
    expect(option!.yieldByProgress!.samples.length).toBeGreaterThan(0);
  });
});

describe("sealedRentabilityLevel", () => {
  it("labels high / medium / low from the now÷start ratio", () => {
    expect(sealedRentabilityLevel(7, 7)).toBe("high");
    expect(sealedRentabilityLevel(3, 7)).toBe("medium");
    expect(sealedRentabilityLevel(0.5, 7)).toBe("low");
    expect(sealedRentabilityLevel(0, 7)).toBe("low");
  });
});

describe("planSetCompletion", () => {
  it("recommends the display when cheap bulk still fills mid-set", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        packsInContainer: 1,
        priceCents: 400,
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
        priceCents: 8000,
      },
    ]);
    /*
      Pool 100, 80 manquantes **bon marché**, booster 12 : espérance ~9.6 ≥ 1,
      Panini ~35 sachets (info volume). Reco = meilleur €/carte → booster
      (~42 ¢) devant display (~105 ¢).
    */
    const missingPrices = new Map(
      Array.from({ length: 80 }, (_, i) => [`c${i}`, 20 as number | null]),
    );
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 100,
      products,
    });
    const mid = planSetCompletion({
      missingPrices,
      poolSize: 100,
      options,
      products,
    });
    expect(mid.preferSingles).toBe(false);
    expect(mid.sealedHoles).toBe(80);
    expect(mid.boostersExpected).toBe(35);
    expect(mid.boostersToComplete).toBe(35);
    expect(mid.recommendedSlug).toBe("booster");
    // Badge booster → volume en sachets, pas « N× display ».
    expect(mid.sealedUnitsExpected).toBeNull();
    expect(mid.sealedUnitsToComplete).toBeNull();
  });

  it("recommends the cheapest €/new sealed option regardless of kind", () => {
    const products = withContainerPackSizes([
      {
        slug: "blister-case-cheap",
        name: "Carton blister",
        kind: "blister_case",
        behavior: "pack_container",
        packsInContainer: 24,
        packSize: 12,
        /*
          Moins cher / neuve que le booster (400→≈42), mais au-dessus des
          cotes bulk (20) — sinon la barre fill vide les trous scellés.
        */
        priceCents: 2500,
      },
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        packsInContainer: 1,
        priceCents: 400,
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
        priceCents: 8000,
      },
    ]);
    const missingPrices = new Map(
      Array.from({ length: 80 }, (_, i) => [`c${i}`, 20 as number | null]),
    );
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 100,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 100,
      options,
      products,
    });
    expect(plan.packThreshold?.slug).toBe("blister-case-cheap");
    expect(plan.recommendedSlug).toBe("blister-case-cheap");
    // 35 sachets / carton de 24 → ≈ 2 unités (comme k boîtes Panini).
    expect(plan.boostersExpected).toBe(35);
    expect(plan.sealedUnitsExpected).toBe(2);
    expect(plan.sealedUnitsToComplete).toBe(2);
  });

  it("keeps Panini volume info without forcing a display recommendation", () => {
    /*
      50 trous bon marché / pool 200 / pack 10 → Panini ~77. Display sans
      prix : reco = booster (seul €/carte comparable).
    */
    const productsB = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 10,
        priceCents: 500,
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
      },
    ]);
    const holes = new Map(
      Array.from({ length: 50 }, (_, i) => [`h${i}`, 30 as number | null]),
    );
    const optionsB = buyOptionsForMissing({
      missing: new Set(holes.keys()),
      poolSize: 200,
      products: productsB,
    });
    const plan = planSetCompletion({
      missingPrices: holes,
      poolSize: 200,
      options: optionsB,
      products: productsB,
    });
    expect(plan.boostersExpected).toBe(77);
    expect(plan.recommendedSlug).toBe("booster");
  });

  /*
    Premier Chapitre à 207/220 : 13 trous dont des enchanted. Espérance
    uniforme ~0.7 < 1 → fin de set. Forums : singles, pas display.
  */
  it("prefers singles at endgame instead of recommending a display for chase holes", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster 12 cartes",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        priceCents: 388,
      },
      {
        slug: "display",
        name: "display 24 boosters premier chapitre",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
        priceCents: 9000,
      },
    ]);
    const missingPrices = new Map<string, number | null>([
      ["promo", 1150],
      ...Array.from({ length: 12 }, (_, i) => [`enc${i}`, 9000 + i * 1000] as const),
    ]);
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 220,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 220,
      options,
      products,
    });
    expect(plan.preferSingles).toBe(true);
    expect(plan.buySinglesCount).toBe(13);
    expect(plan.buySinglesKeys).toHaveLength(13);
    expect(plan.buySinglesKeys).toEqual(
      expect.arrayContaining(["promo", "enc0", "enc11"]),
    );
    expect(plan.sealedHoles).toBe(0);
    expect(plan.recommendedSlug).toBeNull();
    expect(plan.boostersExpected).toBeNull();
    expect(plan.boostersToComplete).toBeNull();
  });

  it("sends chase above pack €/new to singles even mid-set", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        priceCents: 400,
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
      },
    ]);
    // 40 cheap + 2 chase / pool 100 → espérance 5.0 ; reco = booster (€/carte).
    const missingPrices = new Map<string, number | null>([
      ...Array.from({ length: 40 }, (_, i) => [`c${i}`, 25] as const),
      ["elsa", 44750],
      ["mickey", 13450],
    ]);
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 100,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 100,
      options,
      products,
    });
    expect(plan.preferSingles).toBe(false);
    expect(plan.buySinglesCount).toBe(2);
    expect(plan.buySinglesCents).toBe(44750 + 13450);
    expect(plan.buySinglesKeys).toEqual(["elsa", "mickey"]);
    expect(plan.sealedHoles).toBe(40);
    expect(plan.sealedHoleKeys).toHaveLength(40);
    expect(plan.sealedHoleKeys).toEqual(
      expect.arrayContaining(["c0", "c39"]),
    );
    expect(plan.sealedHoleKeys).not.toContain("elsa");
    expect(plan.recommendedSlug).toBe("booster");
    expect(plan.packThreshold).toEqual({
      slug: "booster",
      name: "Booster",
      centsPerNewCard: expect.any(Number),
    });
    expect(plan.packThreshold!.centsPerNewCard).toBeGreaterThan(0);
    expect(plan.packThreshold!.centsPerNewCard).toBeLessThan(44750);
  });

  it("badges a random fill product, not a cheaper exact deck", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        priceCents: 400,
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
        priceCents: 9000,
      },
      {
        slug: "starter",
        name: "Starter",
        kind: "deck",
        behavior: "known_bundle",
        contentsKnown: true,
        prints: Array.from({ length: 40 }, (_, i) => `c${i}`),
        priceCents: 400,
      },
    ]);
    const missingPrices = new Map(
      Array.from({ length: 80 }, (_, i) => [`c${i}`, 20 as number | null]),
    );
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 100,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 100,
      options,
      products,
    });
    expect(plan.preferSingles).toBe(false);
    // Badge = meilleur € / neuve (starter) ; barre chase = fill (booster).
    expect(plan.recommendedSlug).toBe("starter");
    expect(plan.packThreshold?.slug).toBe("booster");
    expect(options[0]?.slug).toBe("starter");
    const starter = options.find((row) => row.slug === "starter");
    const display = options.find((row) => row.slug === "display");
    expect(starter?.centsPerNewCard).not.toBeNull();
    expect(display?.centsPerNewCard).not.toBeNull();
    expect(starter!.centsPerNewCard!).toBeLessThan(display!.centsPerNewCard!);
  });

  it("drops a starter from advice once all its prints are owned", () => {
    const products = withContainerPackSizes([
      {
        slug: "starter",
        name: "Starter",
        kind: "deck",
        behavior: "known_bundle",
        contentsKnown: true,
        prints: ["a", "b", "c"],
        priceCents: 400,
      },
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 10,
        priceCents: 400,
      },
    ]);
    const missing = new Set(["x1", "x2", "x3", "x4", "x5"]);
    const options = buyOptionsForMissing({
      missing,
      poolSize: 40,
      products,
    });
    const starter = options.find((row) => row.slug === "starter");
    expect(starter?.newCards).toBe(0);
    const plan = planSetCompletion({
      missingPrices: new Map([...missing].map((key) => [key, 20])),
      poolSize: 40,
      options,
      products,
    });
    expect(plan.recommendedSlug).toBe("booster");
  });

  it("badges a multi-pack trove over a single booster, not a mixed starter", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        priceCents: 300,
      },
      {
        slug: "trove",
        name: "Trove",
        kind: "trove",
        behavior: "mixed_bundle",
        packsInContainer: 8,
        packSize: 12,
        // Moins cher / carte que 8× le booster nu → badge fill.
        priceCents: 1600,
      },
      {
        slug: "starter",
        name: "Starter",
        kind: "deck",
        behavior: "mixed_bundle",
        packsInContainer: 1,
        packSize: 12,
        contentsKnown: true,
        prints: Array.from({ length: 22 }, (_, i) => `c${i}`),
        priceCents: 550,
      },
    ]);
    const missingPrices = new Map(
      Array.from({ length: 190 }, (_, i) => [`c${i}`, 20 as number | null]),
    );
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 220,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 220,
      options,
      products,
    });
    expect(plan.preferSingles).toBe(false);
    // Starter gagne au € / neuve → badge ; fill / volume restent le trove.
    expect(plan.recommendedSlug).toBe("starter");
    expect(plan.packThreshold?.slug).toBe("trove");
    expect(plan.sealedUnitsExpected).not.toBeNull();
    expect(plan.recommendedSlug).not.toBe("trove");
    expect(plan.recommendedSlug).not.toBe("booster");
  });

  it("lowers the chase threshold when a discounted display beats loose boosters", () => {
    const products = withContainerPackSizes([
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        packSize: 12,
        priceCents: 400,
      },
      {
        slug: "display",
        name: "Display",
        kind: "display",
        behavior: "pack_container",
        packsInContainer: 24,
        // ≈ 50 ¢ / sachet vs 400 ¢ au détail — gagne au € / neuve.
        priceCents: 1200,
      },
    ]);
    // Cotes sous la barre display (≈16) → restent en fill scellé.
    const missingPrices = new Map(
      Array.from({ length: 80 }, (_, i) => [`c${i}`, 10 as number | null]),
    );
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 100,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 100,
      options,
      products,
    });
    const booster = options.find((row) => row.slug === "booster");
    const display = options.find((row) => row.slug === "display");
    expect(display?.centsPerNewCard).not.toBeNull();
    expect(booster?.centsPerNewCard).not.toBeNull();
    expect(display!.centsPerNewCard!).toBeLessThan(booster!.centsPerNewCard!);
    expect(plan.packThreshold?.slug).toBe("display");
    expect(plan.recommendedSlug).toBe("display");
    expect(plan.sealedHoles).toBe(80);
  });

  it("still estimates boosters to complete when nothing is priced", () => {
    const products = [
      {
        slug: "booster",
        name: "Booster Série 1",
        kind: "booster",
        behavior: "random_pack" as const,
        packSize: 8,
        language: "fr",
      },
    ];
    const missingPrices = new Map<string, number | null>(
      Array.from({ length: 66 }, (_, i) => [`c${i}`, null]),
    );
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 182,
      products,
      preferredLanguage: "fr",
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 182,
      options,
      products,
    });
    expect(plan.buySinglesCount).toBe(0);
    expect(plan.sealedHoles).toBe(0);
    expect(plan.boostersExpected).toBeNull();
    expect(plan.boostersToComplete).toBe(94);
    expect(plan.recommendedSlug).toBeNull();
    expect(plan.preferSingles).toBe(false);
  });

  it("does not claim prefer-singles when everything is unpriced and only a foreign display exists", () => {
    /*
      Cas Série 28 : check-list FR, 117 sans prix, seul scellé = display EN
      sans taille de sachet → avant : packSize 0 ⇒ « fin de set / singles ».
    */
    const products = [
      {
        slug: "display-en",
        name: "Display Série 28 — Ultimate Ninja Storm 3",
        kind: "display",
        behavior: "pack_container" as const,
        packsInContainer: 24,
        language: "en",
      },
      {
        slug: "booster-fr",
        name: "Booster Série 28",
        kind: "booster",
        behavior: "random_pack" as const,
        packSize: 8,
        language: "fr",
      },
    ];
    const missingPrices = new Map<string, number | null>(
      Array.from({ length: 117 }, (_, i) => [`c${i}`, null]),
    );
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 150,
      products,
      preferredLanguage: "fr",
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 150,
      options,
      products,
    });
    expect(plan.preferSingles).toBe(false);
    expect(plan.buySinglesCount).toBe(0);
    expect(plan.boostersToComplete).not.toBeNull();
    expect(plan.boostersToComplete!).toBeGreaterThan(10);
  });

  it("does not pretend endgame when no pack size is known at all", () => {
    const products = [
      {
        slug: "display-en",
        name: "Display EN",
        kind: "display",
        behavior: "pack_container" as const,
        packsInContainer: 24,
        language: "en",
      },
    ];
    const missingPrices = new Map<string, number | null>(
      Array.from({ length: 50 }, (_, i) => [`c${i}`, null]),
    );
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 100,
      products,
      preferredLanguage: "fr",
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 100,
      options,
      products,
    });
    expect(plan.preferSingles).toBe(false);
    expect(plan.boostersToComplete).toBeNull();
  });

  it("does not recommend sealed when only a few cheap holes remain (endgame EV)", () => {
    const products = [
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack" as const,
        packSize: 12,
        priceCents: 400,
      },
    ];
    // 2 / 200 → espérance 0.1 < 1 → singles, même si bon marché.
    const missingPrices = new Map<string, number | null>([
      ["cheap", 50],
      ["also", 100],
    ]);
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 200,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 200,
      options,
      products,
    });
    expect(plan.preferSingles).toBe(true);
    expect(plan.buySinglesCount).toBe(2);
    expect(plan.sealedHoles).toBe(0);
    expect(plan.recommendedSlug).toBeNull();
    expect(plan.boostersToComplete).toBeNull();
  });

  it("keeps both finishes of the same print in the endgame singles cart", () => {
    const products = [
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack" as const,
        packSize: 12,
        priceCents: 400,
      },
    ];
    /*
      Master set : NI-019 Normale + Scellé = deux lignes, même cote printKey.
      Indexer le Map par printKey seul n'en gardait qu'une (18 au lieu de 19).
    */
    const missingPrices = new Map<string, number | null>([
      ["naruto:ni-019|normale", 1000],
      ["naruto:ni-019|scelle", 1000],
      ["naruto:cl-003|", 10],
    ]);
    const options = buyOptionsForMissing({
      missing: new Set(["naruto:ni-019", "naruto:cl-003"]),
      poolSize: 198,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 198,
      options,
      products,
    });
    expect(plan.preferSingles).toBe(true);
    expect(plan.buySinglesCount).toBe(3);
    expect(plan.buySinglesCents).toBe(2010);
    expect(plan.buySinglesKeys).toEqual([
      "naruto:ni-019|normale",
      "naruto:ni-019|scelle",
      "naruto:cl-003|",
    ]);
  });

  /** Sans cote ≠ 0 € : on ne les range ni en singles ni en trous scellés. */
  it("leaves unpriced holes out of the singles-vs-sealed split", () => {
    const products = [
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack" as const,
        packSize: 12,
        priceCents: 400,
      },
    ];
    // Assez de trous pour rester hors fin de set (espérance ≥ 1).
    const missingPrices = new Map<string, number | null>([
      ...Array.from({ length: 30 }, (_, i) => [`bulk${i}`, 50] as const),
      ["unknown", null],
      ["also-unknown", null],
      ["expensive", 5000],
    ]);
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 200,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 200,
      options,
      products,
    });
    expect(plan.buySinglesCount).toBe(1);
    expect(plan.buySinglesCents).toBe(5000);
    expect(plan.sealedHoles).toBe(30);
  });

  /** Aucun booster coté → pas de seuil : on n'invente pas « N sous le seuil (0 €) ». */
  it("does not pretend every hole is a cheap single when sealed has no €/card", () => {
    const products = [
      {
        slug: "starter",
        name: "Starter",
        kind: "deck",
        behavior: "known_bundle" as const,
        prints: ["a", "b"],
      },
    ];
    const missingPrices = new Map<string, number | null>([
      ["a", null],
      ["b", null],
      ["c", 100],
    ]);
    const options = buyOptionsForMissing({
      missing: new Set(missingPrices.keys()),
      poolSize: 50,
      products,
    });
    const plan = planSetCompletion({
      missingPrices,
      poolSize: 50,
      options,
      products,
    });
    expect(plan.buySinglesCount).toBe(0);
    expect(plan.buySinglesCents).toBe(0);
    expect(plan.sealedHoles).toBe(0);
    expect(plan.recommendedSlug).toBeNull();
  });
});

describe("sealedSourcesByPrint", () => {
  it("indexes guaranteed prints from fixed bundles only", () => {
    const index = sealedSourcesByPrint([
      {
        slug: "starter",
        name: "Starter Aurora",
        kind: "deck",
        behavior: "known_bundle",
        prints: ["lorcana:1-1", "lorcana:1-2"],
        imageUrl: "/assets/lorcana/products/starter/art.webp",
      },
      {
        slug: "gift",
        name: "Gift Hades",
        kind: "coffret",
        behavior: "mixed_bundle",
        prints: ["lorcana:1-5"],
      },
      {
        slug: "booster",
        name: "Booster",
        kind: "booster",
        behavior: "random_pack",
        prints: ["lorcana:1-1"],
        packSize: 12,
      },
      {
        slug: "preview",
        name: "Coffret preview",
        kind: "coffret",
        behavior: "mixed_bundle",
        prints: ["lorcana:1-99"],
        printsArePreview: true,
      },
    ]);
    expect(index.get("lorcana:1-1")?.map((s) => s.slug)).toEqual(["starter"]);
    expect(index.get("lorcana:1-1")?.[0]?.imageUrl).toBe(
      "/assets/lorcana/products/starter/art.webp",
    );
    expect(index.get("lorcana:1-5")?.map((s) => s.slug)).toEqual(["gift"]);
    expect(index.get("lorcana:1-99")).toBeUndefined();
  });

  it("indexes listed random pools (manga prerelease, not set lottery)", () => {
    const index = sealedSourcesByPrint([
      {
        slug: "kana-manga-pack-1-2-3",
        name: "Pack manga",
        kind: "special",
        behavior: "random_pack",
        setId: "s1",
        randomPoolScope: "listed",
        randomPoolPrints: [
          "naruto:ni-0019-prerelease",
          "naruto:ni-0025-prerelease",
        ],
        cardCount: 1,
        imageUrl: "/assets/naruto/carddass/products/kana-manga/art.jpg",
      },
      {
        slug: "booster-s1",
        name: "Booster S1",
        kind: "booster",
        behavior: "random_pack",
        setId: "s1",
        packSize: 8,
      },
    ]);
    expect(index.get("naruto:ni-0019-prerelease")?.map((s) => s.slug)).toEqual([
      "kana-manga-pack-1-2-3",
    ]);
    expect(index.get("naruto:ni-0025-prerelease")?.[0]?.imageUrl).toContain(
      "kana-manga",
    );
    expect(index.get("naruto:ni-0019")).toBeUndefined();
  });
});

describe("buyOptionsForMissing listed pool", () => {
  it("estimates new cards from the listed pool, not the whole set", () => {
    const pool = [
      "naruto:ni-0019-prerelease",
      "naruto:ni-0025-prerelease",
      "naruto:ni-0027-prerelease",
      "naruto:ni-0047-prerelease",
    ];
    const [option] = buyOptionsForMissing({
      missing: new Set([
        "naruto:ni-0019-prerelease",
        "naruto:ni-0025-prerelease",
        "naruto:ni-9999",
      ]),
      poolSize: 194,
      products: [
        {
          slug: "kana-manga-pack-1-2-3",
          name: "Pack manga",
          kind: "special",
          behavior: "random_pack",
          setId: "s1",
          cardCount: 1,
          randomPoolScope: "listed",
          randomPoolPrints: pool,
          language: "fr",
        },
      ],
    });
    // 2/4 of the pool still missing → E = 0.5 for one draw
    expect(option).toMatchObject({
      slug: "kana-manga-pack-1-2-3",
      newCards: 0.5,
      certainty: "expected",
    });
    expect(option?.basis).toMatch(/Pool listé/i);
  });
});

describe("buyOptionsForMissing image", () => {
  it("carries the packshot through to each option", () => {
    const [option] = buyOptionsForMissing({
      missing: new Set(["c0"]),
      poolSize: 10,
      products: [
        {
          slug: "starter",
          name: "Starter",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["c0"],
          imageUrl: "/assets/x/products/starter/art.webp",
        },
      ],
    });
    expect(option?.imageUrl).toBe("/assets/x/products/starter/art.webp");
  });
});

describe("buyOptionsForMissing language", () => {
  it("keeps only sealed in the checklist language when preferred alone", () => {
    const missing = new Set(Array.from({ length: 40 }, (_, i) => `c${i}`));
    const options = buyOptionsForMissing({
      missing,
      poolSize: 100,
      preferredLanguage: "fr",
      products: [
        {
          slug: "booster-de",
          name: "Booster Série 1",
          kind: "booster",
          behavior: "random_pack",
          packSize: 10,
          language: "de",
          priceCents: 400,
        },
        {
          slug: "booster-it",
          name: "Booster Série 1",
          kind: "booster",
          behavior: "random_pack",
          packSize: 10,
          language: "it",
        },
        {
          slug: "booster-fr",
          name: "Booster Série 1",
          kind: "booster",
          behavior: "random_pack",
          packSize: 10,
          language: "fr",
        },
        {
          slug: "starter-fr",
          name: "Starter Pays du Vent",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["c0", "c1"],
          language: "fr",
        },
      ],
    });
    expect(options.map((row) => row.slug)).toEqual([
      "booster-fr",
      "starter-fr",
    ]);
  });

  it("falls back to other-language sealed when the allowlist matches nothing (Sage's Legacy FR)", () => {
    const missing = new Set(Array.from({ length: 112 }, (_, i) => `c${i}`));
    const options = buyOptionsForMissing({
      missing,
      poolSize: 120,
      allowedLanguages: ["fr"],
      preferredLanguage: "fr",
      products: [
        {
          slug: "booster-s24",
          name: "Booster Série 24",
          kind: "booster",
          behavior: "random_pack",
          packSize: 10,
          language: "en",
        },
        {
          slug: "display-s24",
          name: "Display Série 24",
          kind: "display",
          behavior: "pack_container",
          packSize: 10,
          packsInContainer: 24,
          language: "en",
        },
      ],
    });
    expect(options.map((row) => row.slug).sort()).toEqual([
      "booster-s24",
      "display-s24",
    ]);
    expect(options.every((row) => row.languageMismatch)).toBe(true);
    const display = options.find((row) => row.slug === "display-s24")!;
    const booster = options.find((row) => row.slug === "booster-s24")!;
    expect(booster.newCards).toBe(9.3);
    // 24 sachets ≫ 1 : le display ne doit plus coller au booster.
    expect(display.newCards).toBeGreaterThan(80);
    expect(display.newCards).toBeLessThanOrEqual(112);
  });

  it("never equates a Storm 3 display to one booster (packsOpened)", () => {
    const missing = new Set(Array.from({ length: 117 }, (_, i) => `c${i}`));
    const products = withContainerPackSizes([
      {
        slug: "booster-s28",
        name: "Booster Série 28",
        kind: "booster",
        behavior: "random_pack",
        setId: "s28",
        packSize: 8,
        language: "fr",
      },
      {
        slug: "display-s28-fr",
        name: "Display Série 28",
        kind: "display",
        behavior: "pack_container",
        setId: "s28",
        packsInContainer: 24,
        language: "fr",
      },
      {
        slug: "display-orphan",
        name: "Display sans sachets",
        kind: "display",
        behavior: "pack_container",
        setId: "orphan",
        packSize: 8,
        language: "fr",
      },
    ]);
    const options = buyOptionsForMissing({
      missing,
      poolSize: 120,
      preferredLanguage: "fr",
      products,
    });
    const booster = options.find((row) => row.slug === "booster-s28")!;
    const display = options.find((row) => row.slug === "display-s28-fr")!;
    const orphan = options.find((row) => row.slug === "display-orphan")!;
    expect(booster.newCards).toBe(7.8);
    expect(display.newCards).toBeGreaterThan(90);
    expect(display.newCards).toBeLessThanOrEqual(117);
    expect(orphan.certainty).toBe("unknown");
    expect(orphan.newCards).toBe(0);
  });

  it("keeps FR+IT when allowed, drops DE, and prefixes flags on shared kinds", () => {
    const missing = new Set(Array.from({ length: 40 }, (_, i) => `c${i}`));
    const options = buyOptionsForMissing({
      missing,
      poolSize: 100,
      allowedLanguages: ["fr", "it"],
      preferredLanguage: "fr",
      products: [
        {
          slug: "booster-de",
          name: "Booster Série 1",
          kind: "booster",
          behavior: "random_pack",
          packSize: 10,
          language: "de",
        },
        {
          slug: "booster-it",
          name: "Booster Série 1",
          kind: "booster",
          behavior: "random_pack",
          packSize: 10,
          language: "it",
        },
        {
          slug: "booster-fr",
          name: "Booster Série 1",
          kind: "booster",
          behavior: "random_pack",
          packSize: 10,
          language: "fr",
        },
        {
          slug: "starter-fr",
          name: "Starter Pays du Vent",
          kind: "deck",
          behavior: "known_bundle",
          prints: ["c0", "c1"],
          language: "fr",
        },
      ],
    });
    expect(options.map((row) => row.slug)).toEqual([
      "booster-fr",
      "starter-fr",
      "booster-it",
    ]);
    expect(options.find((row) => row.slug === "booster-fr")?.name).toBe(
      "🇫🇷 Booster Série 1",
    );
    expect(options.find((row) => row.slug === "booster-it")?.name).toBe(
      "🇮🇹 Booster Série 1",
    );
    // Un seul starter FR → pas de drapeau.
    expect(options.find((row) => row.slug === "starter-fr")?.name).toBe(
      "Starter Pays du Vent",
    );
  });
});
