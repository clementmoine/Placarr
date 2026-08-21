/** Client-safe sealed SKU row for Catalogue → Scellés. */

export type CatalogueSealedRow = {
  productKey: string;
  slug: string;
  kind: "booster" | "display" | "deck" | "coffret";
  behavior: "random_pack" | "pack_container" | "known_bundle" | "mixed_bundle";
  name: string | null;
  setCode: string | null;
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
