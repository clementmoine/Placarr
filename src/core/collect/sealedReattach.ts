/**
 * Remontage / détachement de contenance (décisions 8–9).
 *
 * Depuis un objet sorti d'un scellé (booster, carte garantie), on propose les
 * parents d'étagère dont la **composition connue** prévoit ce type ; l'utilisateur
 * choisit. Virtuels = dérivation lecture — ici on ne lie que des items réels
 * sous un parent **déjà ouvert** (partial / emptied).
 */
import {
  parseSealedSkuKey,
} from "@/core/collect/sealedOpen";
import {
  toContentsTree,
  type SealedContentsSource,
} from "@/core/collect/sealedContentsTree";

export type ReattachChildRef =
  | { kind: "sealed"; slug: string; skuKey: string }
  | { kind: "card"; printKey: string };

export type ReattachParentView = {
  id: string;
  name: string;
  kind: string;
  skuKey: string | null;
  openedAt?: Date | string | null;
  countsAsOwned: boolean;
};

export type CompatibleParent = {
  id: string;
  name: string;
  skuKey: string;
  slots: number;
  attachedMatching: number;
  remaining: number;
};

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Identité catalogue d'un item enfant pour le matching composition. */
export function reattachChildRef(item: {
  kind?: string | null;
  skuKey?: string | null;
  printKey?: string | null;
}): ReattachChildRef | null {
  const kind = (item.kind ?? "").trim();
  if (kind === "sealed" || kind === "shell") {
    const parsed = parseSealedSkuKey(item.skuKey);
    if (!parsed) return null;
    if (kind === "shell") return null; // shell stays under parent as role=shell
    return {
      kind: "sealed",
      slug: parsed.slug,
      skuKey: item.skuKey!.trim(),
    };
  }
  const printKey = item.printKey?.trim() ?? "";
  if (!printKey) return null;
  return { kind: "card", printKey };
}

/**
 * Combien de places la composition réserve pour cet enfant
 * (`guaranteedProducts` / prints fixes). 0 = pas compatible.
 */
export function compositionSlotsForChild(
  product: SealedContentsSource,
  child: ReattachChildRef,
): number {
  if (!product.contentsKnown || product.printsArePreview) return 0;
  const tree = toContentsTree(product);
  if (child.kind === "sealed") {
    const want = norm(child.slug);
    let slots = 0;
    for (const node of tree) {
      if (node.kind === "sku" && norm(node.slug) === want) {
        slots += Math.max(0, Math.floor(node.qty));
      }
    }
    return slots;
  }
  const want = norm(child.printKey);
  let slots = 0;
  for (const node of tree) {
    if (node.kind !== "fixed") continue;
    for (const row of node.prints) {
      if (norm(row.printKey) === want) {
        slots += Math.max(1, Math.floor(row.qty ?? 1));
      }
    }
  }
  return slots;
}

export type PlanContainmentAttachOk = {
  ok: true;
  parentId: string;
  childRef: ReattachChildRef;
  slots: number;
  attachedMatching: number;
  remaining: number;
};

export type PlanContainmentAttachErr = {
  ok: false;
  reason:
    | "missing_child"
    | "parent_not_sealed"
    | "parent_still_sealed"
    | "parent_not_owned"
    | "composition_mismatch"
    | "capacity_full"
    | "already_linked"
    | "self_parent";
};

export type PlanContainmentAttach =
  | PlanContainmentAttachOk
  | PlanContainmentAttachErr;

/**
 * Valide un rattachement child → parent. Le parent doit être un scellé
 * **ouvert** (les contenus n'existent comme items que post-ouverture).
 */
export function planContainmentAttach(input: {
  child: ReattachChildRef | null;
  parent: ReattachParentView;
  product: SealedContentsSource;
  /** Matching content links already on this parent. */
  attachedMatching: number;
  /** Child already has a content parent link. */
  childAlreadyLinked?: boolean;
}): PlanContainmentAttach {
  if (!input.child) return { ok: false, reason: "missing_child" };
  if (input.childAlreadyLinked) return { ok: false, reason: "already_linked" };
  if (input.parent.id && input.child.kind === "sealed") {
    /* self-check done by caller via ids — keep reason for API */
  }
  if ((input.parent.kind ?? "").trim() !== "sealed") {
    return { ok: false, reason: "parent_not_sealed" };
  }
  if (!input.parent.countsAsOwned) {
    return { ok: false, reason: "parent_not_owned" };
  }
  if (!input.parent.openedAt) {
    return { ok: false, reason: "parent_still_sealed" };
  }

  const slots = compositionSlotsForChild(input.product, input.child);
  if (slots <= 0) return { ok: false, reason: "composition_mismatch" };

  const attached = Math.max(0, Math.floor(input.attachedMatching));
  if (attached >= slots) return { ok: false, reason: "capacity_full" };

  return {
    ok: true,
    parentId: input.parent.id,
    childRef: input.child,
    slots,
    attachedMatching: attached,
    remaining: slots - attached,
  };
}

/** Parents d'étagère compatibles avec capacité restante. */
export function listCompatibleContainmentParents(input: {
  child: ReattachChildRef | null;
  parents: readonly {
    parent: ReattachParentView;
    product: SealedContentsSource;
    attachedMatching: number;
  }[];
}): CompatibleParent[] {
  if (!input.child) return [];
  const out: CompatibleParent[] = [];
  for (const row of input.parents) {
    const plan = planContainmentAttach({
      child: input.child,
      parent: row.parent,
      product: row.product,
      attachedMatching: row.attachedMatching,
    });
    if (!plan.ok) continue;
    const skuKey = row.parent.skuKey?.trim() ?? "";
    if (!skuKey) continue;
    out.push({
      id: row.parent.id,
      name: row.parent.name,
      skuKey,
      slots: plan.slots,
      attachedMatching: plan.attachedMatching,
      remaining: plan.remaining,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Compte combien d'enfants déjà liés matchent la même identité catalogue. */
export function countMatchingAttachedChildren(input: {
  child: ReattachChildRef;
  attachedChildren: readonly {
    kind?: string | null;
    skuKey?: string | null;
    printKey?: string | null;
  }[];
}): number {
  let n = 0;
  for (const row of input.attachedChildren) {
    const ref = reattachChildRef(row);
    if (!ref) continue;
    if (input.child.kind === "sealed" && ref.kind === "sealed") {
      if (norm(ref.slug) === norm(input.child.slug)) n += 1;
    } else if (input.child.kind === "card" && ref.kind === "card") {
      if (norm(ref.printKey) === norm(input.child.printKey)) n += 1;
    }
  }
  return n;
}
