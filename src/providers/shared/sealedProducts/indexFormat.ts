import type { SealedBehavior, SealedKind } from "./kinds";

export type SealedPrintLink = {
  name: string;
  slug: string;
  ref: string | null;
  /** Set when the collector ref round-trips a printKey for this pack's game. */
  printKey: string | null;
  /** Copies in the sealed product when known (playset). Default implied 1. */
  qty?: number;
  /**
   * Finish on the same printKey (`holo`, …) — never encoded in the key itself.
   */
  finish?: string;
};

/** D'où sort la loterie — détail dans `contentLayers.ts`. */
export type RandomPoolScope = "set" | "listed" | "none" | "unknown";

export type SealedProductEntry = {
  slug: string;
  path: string;
  kind: SealedKind;
  behavior: SealedBehavior;
  category: string;
  name: string | null;
  /** Packshot URL (CDN or `/assets/<pack>/products/…`). */
  image: string | null;
  /**
   * Le **dos** de l'emballage, quand il a été photographié.
   *
   * Ce n'est pas une redite du recto : le verso d'un sachet porte l'éditeur et
   * son adresse, le service client, la mention de distribution, le code de
   * recyclage, souvent le code-barres et le texte de contenu. Sur le bonus PS1
   * de Naruto, c'est le dos qui dit 発売元 株式会社バンダイ, `NOT FOR SALE`,
   * l'interdiction d'export hors Japon et l'adresse du site officiel.
   *
   * Reste `null` sur l'immense majorité des SKU : les boutiques ne
   * photographient que la face avant.
   */
  imageBack: string | null;
  /** Series logo (Naruto packshots, Pokémon TCGdex wordmark, …). */
  setLogo: string | null;
  setCode: string | null;
  /**
   * L'extension telle que le **catalogue de tirages** la nomme.
   *
   * `setCode` juste au-dessus est celui de la boutique, et les deux divergent :
   * les produits Lorcana portent `ROTF`, le catalogue porte `2`. Sans cette
   * traduction, aucun produit ne se rattache à un set — mesuré, zéro option de
   * conseil d'achat sur les 141 SKU Lorcana.
   *
   * `null` quand le pack ne sait pas traduire, ou quand plusieurs extensions
   * correspondent : mal rattacher est pire que ne pas rattacher.
   */
  catalogueSetId?: string | null;
  lang: string | null;
  releaseDate: string | null;
  /**
   * Cote boutique en centimes EUR, quand la fiche scellée en publie une
   * (lorcards / dbscards / …). `null` = pas de prix connu — l'option d'achat
   * s'affiche quand même, sans inventer un chiffre.
   */
  priceCents: number | null;
  /**
   * Cartes dans **un** sachet / unité d'ouverture.
   * Distinct de `declaredCardCount` (souvent le pool / set chez lorcards).
   * `null` = non vérifié — pas « zéro ».
   */
  cardsPerPack: number | null;
  /**
   * Sachets que **ce** produit contient.
   * Booster = 1 ; display annoncé « 24 boosters » = 24 ; `null` si inconnu.
   */
  packsContained: number | null;
  /**
   * Sachets **par** `catalogueSetId` / `setCode` quand le SKU mélange plusieurs
   * extensions (Coffret Métal : 1×S1 + 1×S2 + deck S4). Absent = un seul set.
   */
  packsBySet?: Record<string, number> | null;
  /**
   * Sets où les garanties du ledger comptent pour le conseil d'achat.
   * Coffret Métal : `["s4", "promo"]` — pas S5 même si un NI du deck y est
   * rangé au catalogue.
   */
  guaranteeSets?: string[] | null;
  /**
   * Cartes **toujours** présentes (starter exact, promo fixe d'un blister).
   * Ne jamais y mettre un aperçu boutique (15 tuiles).
   */
  guaranteedPrints: SealedPrintLink[];
  /**
   * D'où sort la loterie — voir `contentLayers.ts` / docs/sealed_product_contents.md.
   * `set` sur un booster classique est une **hypothèse** jusqu'à vérification
   * (faux pour judge / manga / promo packs).
   */
  randomPoolScope: RandomPoolScope;
  /** Pool explicite si `randomPoolScope === "listed"`. */
  randomPoolPrints: SealedPrintLink[];
  /** Cartes annoncées par la boutique (sens variable selon le site). */
  declaredCardCount: number | null;
  /**
   * Cartes **différentes** que la sortie ouvre — autre fait que le précédent.
   * Un booster 巻ノ一 tient 70 cartes distinctes et n'en donne qu'une poignée.
   * Même sens que `set_card_count` côté Lorcana.
   */
  setCardCount: number | null;
  contentsKnown: boolean;
  containsPrintsIsPreview: boolean;
  prints: SealedPrintLink[];
};

export type ProductsIndexV1 = {
  version: 1;
  pack: string;
  generatedAt: string;
  products: Record<string, SealedProductEntry>;
};

export function emptyProductsIndex(pack: string): ProductsIndexV1 {
  return {
    version: 1,
    pack,
    generatedAt: new Date().toISOString(),
    products: {},
  };
}

export function isProductsIndexV1(value: unknown): value is ProductsIndexV1 {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    row.version === 1 &&
    typeof row.pack === "string" &&
    !!row.products &&
    typeof row.products === "object"
  );
}

/** Stable id, not a printKey (`pack` may contain `/`). */
export function sealedProductKey(packId: string, slug: string): string {
  return `${packId}::${slug}`;
}
