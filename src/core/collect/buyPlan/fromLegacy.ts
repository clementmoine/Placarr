import type { BuyProduct } from "../buyAdvice";
import { specificPacksPerHitByPrint } from "@/providers/shared/sealedProducts/boosterComposition";
import {
  isSkuPackComposition,
  skuPackCompositionAsProfile,
  type SkuPackComposition,
} from "@/providers/shared/sealedProducts/packCompositionTypes";
import type { Provenance, SealedSku } from "./types";

export type PoolRow = { printKey: string; rarity: string | null | undefined };

/** p = P(≥1 copie dans un sachet) depuis « sachets par touche ». */
export function hitProbabilityFromPacksPerHit(packsPerHit: number): number {
  if (!(packsPerHit > 0) || !Number.isFinite(packsPerHit)) return 0;
  return Math.min(1, 1 / packsPerHit);
}

function provenanceFromSku(
  composition: SkuPackComposition | null | undefined,
): Provenance {
  if (!composition) return "unknown";
  if (composition.provenance === "official") return "official";
  if (composition.provenance === "community") return "community";
  if (composition.provenance === "structural") return "structural";
  return "unknown";
}

function hitMapFromPacksPerHit(
  packs: ReadonlyMap<string, number>,
): Map<string, number> | null {
  const hit = new Map<string, number>();
  for (const [key, packsPerHit] of packs) {
    const p = hitProbabilityFromPacksPerHit(packsPerHit);
    if (p > 0) {
      hit.set(key, p);
      hit.set(key.trim().toLowerCase(), p);
    }
  }
  return hit.size > 0 ? hit : null;
}

function hitMapFromComposition(input: {
  composition: SkuPackComposition;
  pool: readonly PoolRow[];
}): Map<string, number> | null {
  if (input.pool.length === 0) return null;
  const packs = specificPacksPerHitByPrint({
    profile: skuPackCompositionAsProfile(input.composition),
    pool: input.pool,
  });
  if (packs.size === 0) return null;
  return hitMapFromPacksPerHit(packs);
}

/**
 * Loterie sur un pool **listé** (avant-première : 1 carte parmi N) : uniforme,
 * `packSize` cartes par sachet si connu, sinon ≥ 1 carte.
 */
function hitMapFromListedPool(product: BuyProduct): Map<string, number> | null {
  const pool = (product.randomPoolPrints ?? [])
    .map((k) => k.trim())
    .filter(Boolean);
  if (pool.length === 0) return null;
  const draws = Math.max(1, product.packSize ?? 1);
  const p = Math.min(1, draws / pool.length);
  const hit = new Map<string, number>();
  for (const key of pool) {
    hit.set(key, p);
    hit.set(key.toLowerCase(), p);
  }
  return hit;
}

/**
 * BuyProduct (index scellé) → SKU normalisé : garanties **et** sachets.
 *
 * - `known_bundle` : garanties seules.
 * - `mixed_bundle` : garanties (si listées, pas aperçu) **+** sachets
 *   (`packsInContainer`) — un coffret promo + 5 boosters compte les deux.
 * - `random_pack` : 1 sachet ; `pack_container` : `packsInContainer` sachets.
 *
 * Taux : `product.packComposition` (SKU) ; `"none"` = pas de loterie
 * chiffrable (jamais de repli set) ; sinon repli `packsPerHitByPrint` (set).
 */
export function sealedSkuFromProduct(input: {
  product: BuyProduct;
  pool?: readonly PoolRow[];
  /** Repli set-level quand le SKU n'a pas de `packComposition`. */
  packsPerHitByPrint?: ReadonlyMap<string, number>;
}): SealedSku {
  const { product } = input;
  const hasKnownPrints =
    (product.prints?.length ?? 0) > 0 && !product.printsArePreview;

  const guaranteed =
    product.behavior === "known_bundle" || product.behavior === "mixed_bundle"
      ? hasKnownPrints
        ? [...(product.prints ?? [])]
        : []
      : [];
  /* Deck sans liste curatée : contenu garanti inconnu, pas « vide ». */
  const guaranteedPartial =
    (product.behavior === "known_bundle" ||
      product.behavior === "mixed_bundle") &&
    (product.printsArePreview === true ||
      product.contentsKnown !== true ||
      guaranteed.length === 0);

  let packs = 0;
  if (product.behavior === "random_pack") packs = 1;
  else if (product.behavior === "pack_container") {
    packs = Math.max(1, product.packsInContainer ?? 1);
  } else if (product.behavior === "mixed_bundle") {
    packs = Math.max(0, product.packsInContainer ?? 0);
  }

  const skuComposition = isSkuPackComposition(product.packComposition)
    ? product.packComposition
    : null;
  const compositionDenied = product.packComposition === "none";

  let packHitByPrint: Map<string, number> | null = null;
  if (packs > 0) {
    if (skuComposition) {
      packHitByPrint = hitMapFromComposition({
        composition: skuComposition,
        pool: input.pool ?? [],
      });
    } else if (product.randomPoolScope === "listed") {
      packHitByPrint = hitMapFromListedPool(product);
    } else if (!compositionDenied && input.packsPerHitByPrint) {
      packHitByPrint = hitMapFromPacksPerHit(input.packsPerHitByPrint);
    }
  }

  return {
    slug: product.slug,
    name: product.name,
    priceCents: product.priceCents ?? null,
    imageUrl: product.imageUrl ?? null,
    guaranteed,
    guaranteedPartial,
    packs,
    packHitByPrint,
    provenance: skuComposition
      ? provenanceFromSku(skuComposition)
      : packHitByPrint
        ? "structural"
        : "unknown",
  };
}

export function sealedSkusFromProducts(input: {
  products: readonly BuyProduct[];
  pool?: readonly PoolRow[];
  packsPerHitByPrint?: ReadonlyMap<string, number>;
}): SealedSku[] {
  return input.products.map((product) =>
    sealedSkuFromProduct({
      product,
      pool: input.pool,
      packsPerHitByPrint: input.packsPerHitByPrint,
    }),
  );
}
