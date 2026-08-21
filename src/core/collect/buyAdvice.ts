/**
 * « Il me manque 47 cartes — qu'est-ce que j'achète ? »
 *
 * La question d'un collectionneur n'est pas *ce qui manque* mais *ce qu'il faut
 * acheter*, et ce sont deux réponses différentes. Ce module compare les options
 * et dit laquelle recommander, sans jamais masquer les autres.
 *
 * **Deux familles de produits, deux mathématiques.** C'est la distinction qui
 * décide de ce qu'on a le droit de promettre :
 *
 * - Un **contenu connu** — deck, coffret — donne un chiffre exact : on sait ce
 *   qu'il y a dedans, donc combien de cartes neuves il apporte.
 * - Un **contenu aléatoire** — booster, display — ne donne qu'une espérance,
 *   qui décroît à mesure que la collection se remplit. Les premières boîtes
 *   apportent beaucoup, les dernières presque rien.
 *
 * L'interface doit dire laquelle des deux elle affiche. Un chiffre exact et une
 * espérance ne se comparent pas sans le préciser.
 */

/** Ce qu'un produit fait des cartes qu'il contient. */
export type ProductBehavior =
  "known_bundle" | "mixed_bundle" | "random_pack" | "pack_container";

export type BuyProduct = {
  slug: string;
  name: string;
  kind: string;
  behavior: ProductBehavior;
  setId?: string | null;
  /** Les tirages que le produit contient, quand ils sont connus. */
  prints?: readonly string[] | null;
  /** `true` quand `prints` n'est qu'un aperçu, pas le contenu réel. */
  printsArePreview?: boolean;
  /**
   * Combien de cartes le produit annonce.
   *
   * **Attention à ce que ça veut dire selon le produit.** Sur un paquet
   * aléatoire, ce chiffre est la taille du **pool** — mesuré chez Lorcana, les
   * boosters annoncent 222 à 452, soit le set entier, pas les douze cartes du
   * sachet. Le prendre pour la taille du paquet faisait annoncer qu'un booster
   * apportait les seize cartes manquantes d'un coup.
   *
   * Sur un contenu connu, c'est bien le nombre de cartes du produit.
   */
  cardCount?: number | null;
  /**
   * Combien de cartes le paquet contient, quand on le sait.
   *
   * Le seul endroit où l'information se trouve chez Lorcana est le **nom du
   * produit** — « Booster 12 cartes Premier Chapitre ». C'est la boutique qui
   * l'écrit, pas nous qui le devinons ; absent, on ne calcule aucune espérance
   * plutôt que d'en inventer une.
   */
  packSize?: number | null;
  priceCents?: number | null;
};

export type BuyOption = {
  slug: string;
  name: string;
  kind: string;
  /**
   * Cartes neuves apportées, à lire **selon `certainty`** :
   *
   * - `exact` — on connaît tout le contenu, c'est un compte.
   * - `atLeast` — contenu fixe dont on ne connaît qu'une partie : un plancher.
   * - `expected` — contenu aléatoire : une espérance.
   * - `unknown` — rien à dire, et `newCards` vaut zéro.
   */
  newCards: number;
  certainty: "exact" | "atLeast" | "expected" | "unknown";
  priceCents: number | null;
  /** Coût par carte neuve, quand on connaît le prix. Sert au classement. */
  centsPerNewCard: number | null;
  /** Pourquoi ce chiffre, en une phrase que l'interface peut afficher. */
  basis: string;
};

/**
 * L'espérance de cartes **neuves** dans un paquet aléatoire.
 *
 * Tirer `k` cartes d'un pool de `pool` dont `missing` manquent : chaque carte
 * tirée a `missing / pool` chances d'être neuve. On ignore délibérément les
 * taux par rareté — nous ne les avons pas — et les doublons *à l'intérieur* du
 * paquet, qui les rendraient légèrement pessimistes.
 *
 * C'est une borne haute honnête, pas une prédiction. Elle vaut surtout pour
 * **comparer** deux produits entre eux.
 */
export function expectedNewCards(input: {
  packSize: number;
  poolSize: number;
  missing: number;
}): number {
  const { packSize, poolSize, missing } = input;
  if (packSize <= 0 || poolSize <= 0 || missing <= 0) return 0;
  // On ne peut pas apporter plus de cartes neuves qu'il n'en manque.
  const expected = Math.min(packSize * (missing / poolSize), missing);
  return Math.round(expected * 10) / 10;
}

const RANDOM: ReadonlySet<ProductBehavior> = new Set([
  "random_pack",
  "pack_container",
]);

/**
 * Ce que chaque produit apporterait, du meilleur rapport au moins bon.
 *
 * Le classement se fait sur le **coût par carte neuve**, pas sur le nombre de
 * cartes : un display qui apporte trente cartes pour cent euros est un moins
 * bon achat qu'un deck qui en apporte dix pour cinq. Un produit sans prix est
 * rendu quand même, en fin de liste — l'ignorer cacherait une option, et
 * l'utilisateur connaît peut-être son prix.
 */
export function buyOptionsForMissing(input: {
  missing: ReadonlySet<string>;
  poolSize: number;
  products: readonly BuyProduct[];
}): BuyOption[] {
  const options: BuyOption[] = [];

  for (const product of input.products) {
    const random = RANDOM.has(product.behavior);
    const listed = product.prints ?? [];
    const hits = listed.filter((key) => input.missing.has(key)).length;

    let newCards: number;
    let certainty: BuyOption["certainty"];
    let basis: string;

    if (!random && listed.length > 0 && !product.printsArePreview) {
      newCards = hits;
      certainty = "exact";
      basis = `Contenu connu : ${listed.length} cartes listées.`;
    } else if (!random && listed.length > 0) {
      /*
        **Un contenu fixe partiellement connu n'est pas un tirage au sort.**
        Un deck de démarrage contient toujours les mêmes cartes ; si nous n'en
        connaissons que quinze sur vingt-huit, l'inconnue est notre relevé, pas
        le produit. Lui appliquer la formule des paquets aléatoires affichait
        « +1,7 » — une probabilité là où il n'y en a aucune.

        On rend donc un **plancher** : ce que les cartes listées apportent, en
        disant combien manquent à l'appel.
      */
      newCards = hits;
      certainty = "atLeast";
      basis = product.cardCount
        ? `Contenu fixe, ${listed.length} des ${product.cardCount} cartes listées.`
        : `Contenu fixe, ${listed.length} cartes listées sur un total inconnu.`;
    } else if (!random) {
      newCards = 0;
      certainty = "unknown";
      basis = "Contenu fixe, mais aucune carte listée — rien à dire.";
    } else {
      /*
        Un paquet aléatoire ne se calcule que si l'on sait combien de cartes il
        contient. `cardCount` ne le dit pas — il porte la taille du pool.
      */
      const packSize = product.packSize ?? 0;
      newCards = packSize
        ? expectedNewCards({
            packSize,
            poolSize: input.poolSize,
            missing: input.missing.size,
          })
        : 0;
      certainty = packSize ? "expected" : "unknown";
      basis = packSize
        ? `Contenu aléatoire : ${packSize} cartes tirées dans un pool de ${input.poolSize}.`
        : "Contenu aléatoire, et la taille du paquet n'est pas connue — rien à estimer.";
    }

    const priceCents = product.priceCents ?? null;
    options.push({
      slug: product.slug,
      name: product.name,
      kind: product.kind,
      newCards,
      certainty,
      priceCents,
      centsPerNewCard:
        priceCents != null && newCards > 0
          ? Math.round(priceCents / newCards)
          : null,
      basis,
    });
  }

  return options.sort((a, b) => {
    /*
      Un produit qui n'apporte rien n'est pas une option, quel que soit son
      prix : il tombe en fin de liste avant même la comparaison des coûts.
    */
    if (a.newCards > 0 !== b.newCards > 0) return a.newCards > 0 ? -1 : 1;
    if (a.centsPerNewCard != null && b.centsPerNewCard != null) {
      return a.centsPerNewCard - b.centsPerNewCard;
    }
    // Sans prix des deux côtés, le plus de cartes neuves gagne.
    if (a.centsPerNewCard == null && b.centsPerNewCard == null) {
      return b.newCards - a.newCards;
    }
    // Un prix connu passe devant un prix inconnu : il est comparable.
    return a.centsPerNewCard == null ? 1 : -1;
  });
}

/**
 * Le coût d'un achat carte par carte, et **où est la falaise**.
 *
 * Mesuré sur les prix collectés : la médiane est à deux centimes et le maximum
 * à deux mille euros. Compléter 95 % d'un set ne coûte presque rien, les 5 %
 * restants coûtent tout. Annoncer « le set complet vous coûtera 2 404 € » est
 * donc inutile ; ce qu'il faut montrer, c'est la marche.
 */
export function singlesCostBreakdown(pricesCents: readonly (number | null)[]): {
  priced: number;
  unpriced: number;
  totalCents: number;
  /** Le coût des 90 % les moins chers, et ce que coûtent les 10 % restants. */
  cheapCount: number;
  cheapCents: number;
  expensiveCount: number;
  expensiveCents: number;
  medianCents: number | null;
} {
  const known = pricesCents
    .filter((price): price is number => price != null && price >= 0)
    .sort((a, b) => a - b);
  const unpriced = pricesCents.length - known.length;
  const totalCents = known.reduce((sum, price) => sum + price, 0);
  const cut = Math.floor(known.length * 0.9);
  const cheap = known.slice(0, cut);
  const expensive = known.slice(cut);
  return {
    priced: known.length,
    unpriced,
    totalCents,
    cheapCount: cheap.length,
    cheapCents: cheap.reduce((sum, price) => sum + price, 0),
    expensiveCount: expensive.length,
    expensiveCents: expensive.reduce((sum, price) => sum + price, 0),
    medianCents: known.length
      ? (known[Math.floor(known.length / 2)] ?? null)
      : null,
  };
}

/**
 * La taille d'un paquet, lue dans le nom que la boutique lui donne.
 *
 * « Booster 12 cartes Premier Chapitre » → 12. C'est le seul endroit où
 * l'information existe chez Lorcana : le champ `declaredCardCount` d'un booster
 * porte la taille du **set**, pas du sachet.
 *
 * On ne lit que ce qui est écrit. Un nom qui ne dit rien rend `null`, et
 * l'option s'affiche alors sans estimation — c'est plus honnête qu'un chiffre
 * tiré d'une moyenne du marché qu'on n'a pas mesurée.
 */
export function packSizeFromName(
  name: string | null | undefined,
): number | null {
  const match = /\b(\d{1,3})\s*cartes?\b/i.exec(name ?? "");
  if (!match) return null;
  const size = Number(match[1]);
  /*
    Au-delà de cent, ce n'est plus un paquet mais un set : les boutiques
    écrivent « 452 cartes » pour désigner le pool dans le même champ.
  */
  return size > 0 && size <= 100 ? size : null;
}
