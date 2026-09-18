import type {
  SealedBehavior,
  SealedKind,
} from "@/providers/shared/sealedProducts/kinds";
import type {
  RandomPoolScope,
  SealedPrintLink,
} from "@/providers/shared/sealedProducts/indexFormat";

export type CatalogueSealedRow = {
  productKey: string;
  slug: string;
  kind: SealedKind;
  behavior: SealedBehavior;
  name: string | null;
  setCode: string | null;
  /** ISO-ish locale from the products-index (`fr`, `EN`, `ptbr`, …). */
  lang: string | null;
  image: string | null;
  /** Dos de l'emballage, quand une source l'a photographié. Rare. */
  imageBack: string | null;
  setLogo: string | null;
  declaredCardCount: number | null;
  printCount: number;
  contentsKnown: boolean;
  containsPrintsIsPreview: boolean;
  label: string;
};

/** Produit scellé résolu pour la checklist (packshot + qty). */
export type CatalogueSealedContainedProduct = {
  slug: string;
  qty: number;
  name: string | null;
  image: string | null;
  kind: SealedKind;
  productKey: string;
  contentsKnown: boolean;
};

/** Full SKU payload for the Scellés content dialog (checklist). */
export type CatalogueSealedDetail = CatalogueSealedRow & {
  cardsPerPack: number | null;
  packsContained: number | null;
  packsBySet: Record<string, number> | null;
  setCardCount: number | null;
  randomPoolScope: RandomPoolScope;
  /** SKUs scellés inclus (starters / boosters d'un pack multi-produits). */
  guaranteedProducts: CatalogueSealedContainedProduct[];
  guaranteedPrints: SealedPrintLink[];
  randomPoolPrints: SealedPrintLink[];
  /** Shop / curated union list — preview tiles when `containsPrintsIsPreview`. */
  prints: SealedPrintLink[];
};
