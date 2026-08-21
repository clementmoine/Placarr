import type { SealedBehavior, SealedKind } from "./kinds";

export type SealedPrintLink = {
  name: string;
  slug: string;
  ref: string | null;
  /** Set when the collector ref round-trips a printKey for this pack's game. */
  printKey: string | null;
};

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
  lang: string | null;
  releaseDate: string | null;
  /** Cartes par sachet / par boîte. */
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
