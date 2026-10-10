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
    /*
      ETB / tin / trove / multipack / collector sans liste : la loterie vit
      dans les sachets enfants. `unknown` est réservé aux SKUs vraiment
      opaques (quête / avant-première sans attestation).
    */
    const childLotteryKind =
      input.kind === "etb" ||
      input.kind === "tin" ||
      input.kind === "trove" ||
      input.kind === "multipack" ||
      input.kind === "collector_box" ||
      input.kind === "blister" ||
      input.kind === "deck_bundle";
    return {
      guaranteedPrints: [],
      randomPoolScope: childLotteryKind ? "none" : "unknown",
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

/**
 * Structure attestée pour le conseil d'achat / checklist scellée — sans
 * inventaire carte-à-carte.
 *
 * Ex. booster Lorcana : 12 cartes + pool set ; display : 24 sachets.
 * L'aperçu boutique (15 tuiles) n'entre pas dans ce calcul.
 */
export function sealedStructureAttested(input: {
  kind: SealedKind;
  behavior: SealedBehavior;
  contentsKnown: boolean;
  cardsPerPack: number | null | undefined;
  packsContained: number | null | undefined;
  randomPoolScope: RandomPoolScope;
  guaranteedPrintCount?: number;
  /** Taille annoncée (deck 40, set promo 4) — pas un aperçu boutique. */
  declaredCardCount?: number | null;
}): boolean {
  if (input.contentsKnown) return true;
  // Albums / détecteurs / posters : structure « pas de cartes », pas « inconnu ».
  if (input.behavior === "no_cards" || input.kind === "ephemera") {
    return true;
  }
  const cards =
    typeof input.cardsPerPack === "number" && input.cardsPerPack > 0
      ? input.cardsPerPack
      : null;
  const packs =
    typeof input.packsContained === "number" && input.packsContained > 0
      ? input.packsContained
      : null;
  const guarantees = input.guaranteedPrintCount ?? 0;
  const declared =
    typeof input.declaredCardCount === "number" && input.declaredCardCount > 0
      ? input.declaredCardCount
      : null;

  if (input.behavior === "pack_container") {
    return packs != null;
  }

  if (input.behavior === "random_pack") {
    // Pool set / listed = modèle loterie attesté. `cardsPerPack` est un
    // bonus (Lorcana 12) — Pokémon l'omet volontairement (SV≠SWSH≠GO).
    return (
      input.randomPoolScope === "set" || input.randomPoolScope === "listed"
    );
  }

  if (input.behavior === "mixed_bundle") {
    // Sachets, garanties, ou taille annoncée (quest 170/190, set promo 4).
    return packs != null || guarantees > 0 || declared != null;
  }

  if (input.behavior === "known_bundle") {
    // Starter / deck : inventaire partiel, taille annoncée, ou au moins le
    // modèle « liste fixe » (構築済み) même si N n'est pas encore lu sur
    // l'emballage — distinct d'un coffret opaque.
    return (
      guarantees > 0 ||
      declared != null ||
      cards != null ||
      input.kind === "deck"
    );
  }

  return false;
}
