/*
  Le contrat de la check-list distingue deux familles de produits, et c'est
  cette distinction qui décide de ce qu'on a le droit de promettre : un deck
  donne un chiffre, un booster une espérance. Les mélanger reviendrait à
  afficher une prédiction là où on n'a qu'une moyenne.
*/
import { describe, expect, it } from "vitest";

import {
  buyOptionsForMissing,
  expectedNewCards,
  packSizeFromName,
  singlesCostBreakdown,
} from "./buyAdvice";

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
});
