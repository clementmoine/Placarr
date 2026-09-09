/** Client-safe sealed SKU row for Catalogue → Scellés. */

import type {
  SealedBehavior,
  SealedKind,
} from "@/providers/shared/sealedProducts/kinds";

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
