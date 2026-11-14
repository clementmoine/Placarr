/**
 * Cycle scellé — dérivations pures (étape 1), sans schéma / DB.
 *
 * - Contenance : `sealed` | `partial` | `emptied` depuis openedAt + liens.
 * - Virtuels : lecture catalogue (garanties seulement), jamais loterie / preview.
 * - Statut d'affichage unifié pour checklist / grille.
 *
 * `ItemContainmentLink` et colonnes SKU viennent à l'étape 2 — ici on prend
 * des vues abstraites pour figer les règles avant la migration.
 */
import { countsAsOwned, isItemAway, isItemPast } from "@/core/collect/itemAbsence";
import { toContentsTree, type SealedContentsSource } from "@/core/collect/sealedContentsTree";

export type ContainmentState = "sealed" | "partial" | "emptied";

export type ContainmentLinkView = {
  /** Mirrors Prisma `ContainmentRole`. */
  role: "content" | "shell";
  /** Encore rattaché au parent. */
  attached: boolean;
  /**
   * Child is still a sealed product inside the parent (booster in a display).
   * Card / shell children do not keep the parent `partial` after a full open.
   */
  childSealed?: boolean;
};

/**
 * Contenance dérivée. Jamais d'enum stocké fragile — seul `openedAt` est
 * persistant (étape 2) ; les liens disent ce qui reste dedans.
 *
 * - pas d'`openedAt` → `sealed`
 * - ouvert + scellés enfants encore attachés → `partial`
 * - ouvert, plus de scellé dedans → `emptied` (cartes matérialisées = hors)
 */
export function containmentState(input: {
  openedAt?: Date | string | null;
  links?: readonly ContainmentLinkView[] | null;
}): ContainmentState {
  if (!input.openedAt) return "sealed";
  const sealedInside = (input.links ?? []).filter(
    (link) =>
      link.role === "content" && link.attached && link.childSealed === true,
  );
  if (sealedInside.length > 0) return "partial";
  return "emptied";
}

export type VirtualPrintContent = {
  kind: "print";
  printKey: string;
  qty: number;
};

export type VirtualSkuContent = {
  kind: "sku";
  slug: string;
  qty: number;
};

export type VirtualContent = VirtualPrintContent | VirtualSkuContent;

export type VirtualProductView = SealedContentsSource & {
  /** Clé stable parent (`pack::slug`) — provenance des virtuels. */
  skuKey: string;
};

/**
 * Un parent peut-il porter des virtuels à la lecture ?
 *
 * Strict : `contentsKnown`, pas preview, présence owned|away, pas encore ouvert
 * (sinon les contenus sont matérialisés / sortis).
 */
export function canDeriveVirtualContents(input: {
  presence?: string | null;
  openedAt?: Date | string | null;
  contentsKnown?: boolean | null;
  printsArePreview?: boolean | null;
}): boolean {
  if (!countsAsOwned({ presence: input.presence })) return false;
  if (input.openedAt) return false;
  if (!input.contentsKnown) return false;
  if (input.printsArePreview) return false;
  return true;
}

/**
 * Contenu virtuel dérivé du catalogue pour un scellé fermé.
 *
 * - Garanties (`fixed` / `sku` dans l'arbre) seulement.
 * - Display / pack_container : **pas** de virtuel carte-à-carte — N SKUs
 *   enfants si `guaranteedProducts`, sinon rien (packsContained seul ne
 *   invente pas un slug booster).
 * - Loterie (`random`) : jamais un virtuel confiant.
 * - `contentsKnown=false` / preview → liste vide.
 */
export function virtualContents(input: {
  presence?: string | null;
  openedAt?: Date | string | null;
  product: VirtualProductView;
}): VirtualContent[] {
  const product = input.product;
  if (
    !canDeriveVirtualContents({
      presence: input.presence,
      openedAt: input.openedAt,
      contentsKnown: product.contentsKnown,
      printsArePreview: product.printsArePreview,
    })
  ) {
    return [];
  }

  const tree = toContentsTree(product);
  const out: VirtualContent[] = [];
  const printQty = new Map<string, number>();
  const skuQty = new Map<string, number>();

  for (const node of tree) {
    if (node.kind === "fixed") {
      for (const row of node.prints) {
        const key = row.printKey.trim();
        if (!key) continue;
        const qty =
          typeof row.qty === "number" && row.qty > 0 ? Math.floor(row.qty) : 1;
        printQty.set(key, (printQty.get(key) ?? 0) + qty);
      }
      continue;
    }
    if (node.kind === "sku") {
      const slug = node.slug.trim();
      if (!slug) continue;
      const qty = node.qty > 0 ? Math.floor(node.qty) : 1;
      skuQty.set(slug, (skuQty.get(slug) ?? 0) + qty);
      continue;
    }
    // random | units — pas de virtuel confiant (loterie / structure opaque).
  }

  /*
    pack_container pur (display) : toContentsTree peut n'avoir que du random
    packsContained. On n'invente pas N boosters sans slug enfant.
  */
  for (const [printKey, qty] of printQty) {
    out.push({ kind: "print", printKey, qty });
  }
  for (const [slug, qty] of skuQty) {
    out.push({ kind: "sku", slug, qty });
  }
  return out;
}

/** Agrège les printKeys virtuels (qty ≥ 1) pour une checklist / filtre. */
export function virtualPrintKeySet(
  contents: readonly VirtualContent[],
): Set<string> {
  const keys = new Set<string>();
  for (const row of contents) {
    if (row.kind === "print" && row.qty > 0) {
      keys.add(row.printKey.trim().toLowerCase());
    }
  }
  return keys;
}

/**
 * Statut d'affichage unifié (checklist / grille).
 *
 * Priorité : exemplaire physique (owned → away → past) puis couverture
 * virtuelle, sinon manquant. Un `past` physique gagne sur un virtuel (déjà eu
 * ne redevient pas « dans un scellé »).
 */
export type CollectionDisplayStatus =
  | "owned"
  | "away"
  | "virtual"
  | "past"
  | "missing";

export function resolveCollectionDisplayStatus(input: {
  /** Présence d'un item physique pour ce print / SKU, si présent. */
  presence?: string | null;
  /** Couvert par un scellé fermé owned|away (virtuels dérivés). */
  virtual?: boolean;
  /** Item physique existe-t-il (même past) ? */
  hasPhysical?: boolean;
}): CollectionDisplayStatus {
  const hasPhysical =
    input.hasPhysical ?? input.presence != null;
  if (hasPhysical) {
    if (isItemPast({ presence: input.presence })) return "past";
    if (isItemAway({ presence: input.presence })) return "away";
    if (countsAsOwned({ presence: input.presence })) return "owned";
  }
  if (input.virtual) return "virtual";
  return "missing";
}

/**
 * Compte pour le compteur « tout possédé (scellé compris) » : reçu, away, ou
 * virtuel. Pas past / missing.
 */
export function countsTowardPossession(
  status: CollectionDisplayStatus,
): boolean {
  return status === "owned" || status === "away" || status === "virtual";
}

/** « En main » : réellement reçu, pas virtuel ni away. */
export function countsAsInHand(status: CollectionDisplayStatus): boolean {
  return status === "owned";
}
