/**
 * Plan d'ouverture d'un produit scellé (étapes 4–6).
 *
 * - `known_bundle` : matérialiser chaque print garanti.
 * - `mixed_bundle` : prints garantis + SKUs enfants (pile / boosters).
 * - `pack_container` : pile de N scellés enfants (`guaranteedProducts` ou
 *   `childBoosterSlug` × `packsContained` / `packCount` manuel).
 * - `takeSealedCount` : ouverture partielle de la pile.
 * - Déclaration groupée : {@link planSealedDeclare} (cartes sans booster).
 */
import { toContentsTree, type SealedContentsSource } from "@/core/collect/sealedContentsTree";

export type SealedOpenChildPlan =
  | {
      kind: "card";
      printKey: string;
      name: string;
      language: string | null;
    }
  | {
      kind: "sealed";
      skuKey: string;
      slug: string;
      name: string;
      language: string | null;
      catalogueKind: string | null;
    };

export type SealedOpenPlanOk = {
  ok: true;
  parentSkuKey: string;
  behavior: string;
  children: SealedOpenChildPlan[];
  /** Sealed children omitted by partial take (still inside conceptually). */
  remainingSealed: number;
};

export type SealedOpenPlanErr = {
  ok: false;
  reason:
    | "missing_sku"
    | "already_opened"
    | "not_owned"
    | "contents_unknown"
    | "preview"
    | "unsupported_behavior"
    | "empty_contents"
    | "needs_pack_count"
    | "needs_child_slug"
    | "invalid_take";
};

export type SealedOpenPlan = SealedOpenPlanOk | SealedOpenPlanErr;

/** `packId::slug` — packId may contain `/`. */
export function parseSealedSkuKey(
  skuKey: string | null | undefined,
): { packId: string; slug: string } | null {
  const raw = skuKey?.trim() ?? "";
  const sep = raw.indexOf("::");
  if (sep <= 0 || sep >= raw.length - 2) return null;
  const packId = raw.slice(0, sep).trim();
  const slug = raw.slice(sep + 2).trim();
  if (!packId || !slug) return null;
  return { packId, slug };
}

const OPENABLE_BEHAVIORS = new Set([
  "known_bundle",
  "mixed_bundle",
  "pack_container",
]);

/**
 * Blister / booster carton / `packsContained === 1` sans SKU enfant nommé :
 * **une** étape d'ouverture (pas de booster fantôme à rouvrir). Les tirages
 * se déclarent ensuite. Une composition `guaranteedProducts` explicite reste
 * matérialisée (décision composition connue).
 */
export function isUnitPackContainer(product: {
  kind?: string | null;
  behavior?: string | null;
  packsContained?: number | null;
  guaranteedProducts?: readonly { slug?: string | null; qty?: number }[] | null;
}): boolean {
  const behavior = (product.behavior ?? "").trim();
  if (behavior !== "pack_container") return false;
  const kind = (product.kind ?? "").trim().toLowerCase();
  if (kind === "blister" || kind === "booster") return true;
  const namedSkus = (product.guaranteedProducts ?? []).filter((row) =>
    Boolean(row.slug?.trim()),
  );
  if (namedSkus.length > 0) return false;
  return (
    typeof product.packsContained === "number" &&
    Math.floor(product.packsContained) === 1
  );
}

export function planSealedOpen(input: {
  skuKey: string | null | undefined;
  openedAt?: Date | string | null;
  /** Parent must count as owned (owned | away). */
  countsAsOwned: boolean;
  product: SealedContentsSource & {
    name?: string | null;
    lang?: string | null;
    kind?: string | null;
  };
  /** Resolve a display title for a printKey (catalogue). */
  titleForPrint?: (printKey: string) => string | null | undefined;
  /** Resolve a display name for a child sealed slug. */
  titleForSku?: (slug: string) => string | null | undefined;
  /** Prefix for child sealed skuKey (`packId`). */
  packId?: string | null;
  /**
   * When the catalogue has `packsContained` but no `guaranteedProducts`, the
   * caller supplies the child booster slug (never invented).
   */
  childBoosterSlug?: string | null;
  /**
   * Manual pack count when `packsContained` is null (catalogue gap — once).
   */
  packCount?: number | null;
  /**
   * Partial pile: materialize only the first N sealed children. Cards (fixed)
   * from mixed_bundle are always included on first open.
   */
  takeSealedCount?: number | null;
}): SealedOpenPlan {
  const skuKey = input.skuKey?.trim() ?? "";
  if (!skuKey) return { ok: false, reason: "missing_sku" };
  if (input.openedAt) return { ok: false, reason: "already_opened" };
  if (!input.countsAsOwned) return { ok: false, reason: "not_owned" };

  const product = input.product;
  if (!product.contentsKnown) return { ok: false, reason: "contents_unknown" };
  if (product.printsArePreview) return { ok: false, reason: "preview" };

  const behavior = (product.behavior ?? "").trim() || "unknown";
  if (!OPENABLE_BEHAVIORS.has(behavior)) {
    return { ok: false, reason: "unsupported_behavior" };
  }

  const tree = toContentsTree(product);
  const children: SealedOpenChildPlan[] = [];
  const sealedChildren: SealedOpenChildPlan[] = [];
  const lang = product.lang?.trim().toLowerCase() || null;
  const packId =
    input.packId?.trim() || parseSealedSkuKey(skuKey)?.packId || null;

  const pushSealed = (slug: string, qty: number) => {
    if (!packId || !slug || qty <= 0) return;
    const name =
      input.titleForSku?.(slug)?.trim() || slug.replace(/-/g, " ");
    for (let i = 0; i < qty; i += 1) {
      sealedChildren.push({
        kind: "sealed",
        skuKey: `${packId}::${slug}`,
        slug,
        name,
        language: lang,
        catalogueKind: null,
      });
    }
  };

  for (const node of tree) {
    if (node.kind === "fixed") {
      if (behavior === "pack_container") continue;
      for (const row of node.prints) {
        const printKey = row.printKey.trim();
        if (!printKey) continue;
        const qty =
          typeof row.qty === "number" && row.qty > 0 ? Math.floor(row.qty) : 1;
        const title =
          input.titleForPrint?.(printKey)?.trim() || printKey;
        for (let i = 0; i < qty; i += 1) {
          children.push({
            kind: "card",
            printKey,
            name: title,
            language: lang,
          });
        }
      }
      continue;
    }
    if (node.kind === "sku") {
      pushSealed(node.slug.trim(), node.qty > 0 ? Math.floor(node.qty) : 1);
    }
    // units / random — not confident materialize
  }

  /*
    pack_container with packsContained but no child SKU links: caller must
    name the booster slug — except unit packs (blister ×1), opened in one step.
    Never invent a slug from the display slug.
  */
  if (sealedChildren.length === 0 && behavior === "pack_container") {
    if (!isUnitPackContainer(product)) {
      const childSlug = input.childBoosterSlug?.trim() || "";
      const fromCatalogue =
        typeof product.packsContained === "number" && product.packsContained > 0
          ? Math.floor(product.packsContained)
          : null;
      const fromManual =
        typeof input.packCount === "number" && input.packCount > 0
          ? Math.floor(input.packCount)
          : null;
      const count = fromCatalogue ?? fromManual;
      if (count == null) {
        return { ok: false, reason: "needs_pack_count" };
      }
      if (!childSlug) {
        return { ok: false, reason: "needs_child_slug" };
      }
      pushSealed(childSlug, count);
    }
  }

  const takeRaw = input.takeSealedCount;
  let remainingSealed = 0;
  if (takeRaw != null) {
    if (
      typeof takeRaw !== "number" ||
      !Number.isFinite(takeRaw) ||
      takeRaw < 0 ||
      Math.floor(takeRaw) !== takeRaw
    ) {
      return { ok: false, reason: "invalid_take" };
    }
    const take = Math.floor(takeRaw);
    if (take > sealedChildren.length) {
      return { ok: false, reason: "invalid_take" };
    }
    remainingSealed = sealedChildren.length - take;
    children.push(...sealedChildren.slice(0, take));
  } else {
    children.push(...sealedChildren);
  }

  if (children.length === 0) {
    if (isUnitPackContainer(product) && behavior === "pack_container") {
      return {
        ok: true,
        parentSkuKey: skuKey,
        behavior,
        children: [],
        remainingSealed: 0,
      };
    }
    return { ok: false, reason: "empty_contents" };
  }

  return {
    ok: true,
    parentSkuKey: skuKey,
    behavior,
    children,
    remainingSealed,
  };
}

export type SealedDeclarePlanOk = {
  ok: true;
  parentSkuKey: string;
  children: Extract<SealedOpenChildPlan, { kind: "card" }>[];
};

export type SealedDeclarePlanErr = {
  ok: false;
  reason:
    | "missing_sku"
    | "not_owned"
    | "empty_declaration"
    | "invalid_print";
};

export type SealedDeclarePlan = SealedDeclarePlanOk | SealedDeclarePlanErr;

/**
 * Grouped / unit declaration of pulls (random display or booster).
 * Honest: only the printKeys the user supplies — never invents lottery hits.
 */
export function planSealedDeclare(input: {
  skuKey: string | null | undefined;
  countsAsOwned: boolean;
  /** One entry per physical card (duplicates = multiple copies). */
  prints: readonly {
    printKey: string;
    name?: string | null;
    language?: string | null;
  }[];
  defaultLanguage?: string | null;
}): SealedDeclarePlan {
  const skuKey = input.skuKey?.trim() ?? "";
  if (!skuKey) return { ok: false, reason: "missing_sku" };
  if (!input.countsAsOwned) return { ok: false, reason: "not_owned" };

  const langDefault = input.defaultLanguage?.trim().toLowerCase() || null;
  const children: Extract<SealedOpenChildPlan, { kind: "card" }>[] = [];
  for (const row of input.prints) {
    const printKey = row.printKey?.trim() ?? "";
    if (!printKey) return { ok: false, reason: "invalid_print" };
    children.push({
      kind: "card",
      printKey,
      name: row.name?.trim() || printKey,
      language: row.language?.trim().toLowerCase() || langDefault,
    });
  }
  if (children.length === 0) {
    return { ok: false, reason: "empty_declaration" };
  }
  return { ok: true, parentSkuKey: skuKey, children };
}
