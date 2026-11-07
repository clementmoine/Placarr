/**
 * Coarse shelf-item kind — health ≠ containment ≠ presence.
 *
 * Fine sealed taxonomy (booster / ETB / …) stays on the catalogue SKU
 * (`skuKey` → `packId::slug`). This module is the pure mirror of the Prisma
 * `ItemKind` / `ContainmentRole` enums.
 */

export const ITEM_KINDS = ["object", "card", "sealed", "shell"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const CONTAINMENT_ROLES = ["content", "shell"] as const;
export type ContainmentRole = (typeof CONTAINMENT_ROLES)[number];

const KIND_SET = new Set<string>(ITEM_KINDS);
const ROLE_SET = new Set<string>(CONTAINMENT_ROLES);

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === "string" && KIND_SET.has(value);
}

export function isContainmentRole(value: unknown): value is ContainmentRole {
  return typeof value === "string" && ROLE_SET.has(value);
}

/**
 * Default kind when creating / backfilling an item.
 * Print-keyed copies are cards; sealed SKU keys are sealed; else object.
 */
export function defaultItemKind(input: {
  printKey?: string | null;
  skuKey?: string | null;
  kind?: ItemKind | null;
}): ItemKind {
  if (input.kind && isItemKind(input.kind)) return input.kind;
  if (input.skuKey?.trim()) return "sealed";
  if (input.printKey?.trim()) return "card";
  return "object";
}

export function isSealedShelfItem(kind: ItemKind | null | undefined): boolean {
  return kind === "sealed";
}

export function isShellShelfItem(kind: ItemKind | null | undefined): boolean {
  return kind === "shell";
}

/** Snapshot figé à l'acquisition d'un scellé (catalogue peut perdre le slug). */
export function sealedAcquisitionSnapshot(input: {
  skuKey: string;
  skuName?: string | null;
  skuLanguage?: string | null;
  purchasePriceCents?: number | null;
  purchasedAt?: Date | string | null;
  imageUrl?: string | null;
  catalogueKind?: string | null;
}): Record<string, unknown> {
  const snap: Record<string, unknown> = {
    skuKey: input.skuKey.trim(),
  };
  if (input.skuName?.trim()) snap.skuName = input.skuName.trim();
  if (input.skuLanguage?.trim()) {
    snap.skuLanguage = input.skuLanguage.trim().toLowerCase();
  }
  if (
    typeof input.purchasePriceCents === "number" &&
    Number.isFinite(input.purchasePriceCents)
  ) {
    snap.purchasePriceCents = Math.round(input.purchasePriceCents);
  }
  if (input.purchasedAt) {
    snap.purchasedAt =
      input.purchasedAt instanceof Date
        ? input.purchasedAt.toISOString()
        : String(input.purchasedAt);
  }
  if (input.imageUrl?.trim()) snap.imageUrl = input.imageUrl.trim();
  if (input.catalogueKind?.trim()) {
    snap.catalogueKind = input.catalogueKind.trim();
  }
  return snap;
}
