/**
 * Contenu d'un produit scellé — contrat pour le conseil d'achat.
 *
 * **Chaque SKU doit porter ces champs.** `null` / `unknown` / liste vide
 * signifie « pas encore vérifié », jamais « zéro carte » ni « pool vide ».
 * Inventer un contenu (12 cartes Lorcana sans preuve, pool = set pour un
 * judge pack) fausse le conseil.
 *
 * Trois couches qui ne se mélangent pas :
 *
 * 1. **Quantité** — `cardsPerPack` / `packsContained` (sachet, boîte).
 * 2. **Garanties** — cartes toujours présentes (starter, promo fixe).
 * 3. **Loterie** — d'où sort le reste (`set` / sous-pool listé / inconnu).
 *
 * Voir `docs/sealed_product_contents.md`.
 */

import type { SealedBehavior, SealedKind } from "./kinds";
import type { RandomPoolScope, SealedPrintLink } from "./indexFormat";

export type { RandomPoolScope };

export type SealedContentLayers = {
  guaranteedPrints: SealedPrintLink[];
  randomPoolScope: RandomPoolScope;
  randomPoolPrints: SealedPrintLink[];
};

/**
 * Déduit les couches contenu depuis ce qu'on sait déjà du SKU.
 *
 * Ne crée pas de cartes. Un aperçu boutique (15 tuiles) n'est **jamais**
 * une garantie ni un pool — `unknown` plutôt que de mentir.
 */
export function resolveContentLayers(input: {
  kind: SealedKind;
  behavior: SealedBehavior;
  prints: readonly SealedPrintLink[];
  contentsKnown: boolean;
  containsPrintsIsPreview: boolean;
}): SealedContentLayers {
  const prints = [...input.prints];

  if (input.behavior === "no_cards" || input.kind === "ephemera") {
    return {
      guaranteedPrints: [],
      randomPoolScope: "none",
      randomPoolPrints: [],
    };
  }

  if (input.behavior === "pack_container") {
    return {
      guaranteedPrints: [],
      randomPoolScope: "none",
      randomPoolPrints: [],
    };
  }

  if (input.behavior === "known_bundle") {
    if (input.contentsKnown && !input.containsPrintsIsPreview && prints.length) {
      return {
        guaranteedPrints: prints,
        randomPoolScope: "none",
        randomPoolPrints: [],
      };
    }
    return {
      guaranteedPrints: [],
      randomPoolScope: "unknown",
      randomPoolPrints: [],
    };
  }

  if (input.behavior === "mixed_bundle") {
    if (!input.containsPrintsIsPreview && prints.length) {
      return {
        guaranteedPrints: prints,
        /*
          Le reste est en sachets : leur pool appartient aux boosters
          contenus, pas à ce SKU. On ne prétend pas connaître la loterie ici.
        */
        randomPoolScope: "none",
        randomPoolPrints: [],
      };
    }
    return {
      guaranteedPrints: [],
      randomPoolScope: "unknown",
      randomPoolPrints: [],
    };
  }

  // random_pack — booster / judge / story…
  if (input.containsPrintsIsPreview || prints.length === 0) {
    return {
      guaranteedPrints: [],
      /*
        Hypothèse boîte de set : pool = extension. Faux pour judge / manga /
        promo packs — à corriger SKU par SKU (`listed` + randomPoolPrints).
      */
      randomPoolScope: input.kind === "booster" ? "set" : "unknown",
      randomPoolPrints: [],
    };
  }

  return {
    guaranteedPrints: [],
    randomPoolScope: "listed",
    randomPoolPrints: prints,
  };
}
