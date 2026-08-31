/*
  Le contrat de la check-list distingue deux familles de produits, et c'est
  cette distinction qui décide de ce qu'on a le droit de promettre : un deck
  donne un chiffre, un booster une espérance. Les mélanger reviendrait à
  afficher une prédiction là où on n'a qu'une moyenne.
*/
import { describe, expect, it } from "vitest";

import {
  boostersToExpectNearComplete,
  buyOptionsForMissing,
  expectedNewCards,
  packSizeFromName,
  packsOpenedForProduct,
  planSetCompletion,
  projectBuyProductForSet,
  projectBuyProductsBySet,
  sealedSourcesByPrint,
  singlesCostBreakdown,
  withContainerPackSizes,
} from "./buyAdvice";

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
      Panini ~35 sachets (≥ 0.7×24) → display. Les chase iraient en singles.
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
    expect(mid.recommendedSlug).toBe("display");

    /*
      50 trous bon marché / pool 200 / pack 10 → Panini ~77 ≥ 0.7×24 → display.
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
    expect(plan.recommendedSlug).toBe("display");
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
    // 40 cheap + 2 chase / pool 100 → espérance 5.0, display pour le bulk.
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
    expect(plan.sealedHoles).toBe(40);
    expect(plan.recommendedSlug).toBe("display");
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
