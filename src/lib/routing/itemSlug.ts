import { prisma } from "@/lib/db/prisma";

import { slugifyItemName } from "./slugs";

/** Marks duplicate shelf copies — never used by title slugification. */
export const ITEM_COPY_SLUG_MARKER = "copy";

const LEGACY_NUMERIC_COPY_SUFFIX = /-(\d+)$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function copyItemSlug(base: string, copyIndex: number): string {
  return `${base}-${ITEM_COPY_SLUG_MARKER}-${copyIndex}`;
}

function nextDisambiguatedSlug(base: string, taken: Set<string>): string {
  let n = 2;
  while (taken.has(copyItemSlug(base, n))) n++;
  return copyItemSlug(base, n);
}

function itemBaseSlug(item: {
  name?: string | null;
  slug?: string | null;
  id: string;
}): string {
  return slugifyItemName(item.name) || item.slug?.trim() || item.id;
}

/**
 * Legacy duplicate URLs used `-2`, which collides with real sequel titles
 * (`Need for Speed Most Wanted 2` → `need-for-speed-most-wanted-2`).
 */
export function isLegacyNumericDuplicateSlug(item: {
  name?: string | null;
  slug?: string | null;
}): boolean {
  const slug = item.slug?.trim();
  const base = slugifyItemName(item.name);
  if (!slug || !base || slug === base) return false;

  const match = slug.match(
    new RegExp(`^${escapeRegExp(base)}${LEGACY_NUMERIC_COPY_SUFFIX.source}$`),
  );
  if (!match) return false;

  return slugifyItemName(item.name) === base;
}

function collectTakenSlugs(
  rows: Array<{ slug?: string | null }>,
  reserved?: Set<string>,
): Set<string> {
  const taken = new Set(reserved ?? []);
  for (const row of rows) {
    if (row.slug?.trim()) taken.add(row.slug.trim());
  }
  return taken;
}

/**
 * Picks a shelf-unique slug for a new or renamed item. The first copy keeps the
 * base slug (`need-for-speed-most-wanted`); further copies get `-copy-2`, … so
 * they never collide with sequel titles like `…-most-wanted-2`.
 */
export async function allocateUniqueItemSlug(
  shelfId: string,
  name: string,
  options: { excludeItemId?: string; reserved?: Set<string> } = {},
): Promise<string> {
  const base = slugifyItemName(name);
  if (!base) return options.excludeItemId ?? "";

  const existing = await prisma.item.findMany({
    where: {
      shelfId,
      ...(options.excludeItemId ? { id: { not: options.excludeItemId } } : {}),
    },
    select: { slug: true },
  });

  const taken = collectTakenSlugs(existing, options.reserved);
  if (!taken.has(base)) return base;
  return nextDisambiguatedSlug(base, taken);
}

/**
 * Backfills duplicate item slugs on one shelf so each URL resolves to a single
 * item. Oldest copy keeps the canonical slug; later copies get `-copy-N`.
 */
export async function reconcileDuplicateItemSlugsOnShelf(
  shelfId: string,
): Promise<number> {
  const items = await prisma.item.findMany({
    where: { shelfId },
    select: { id: true, name: true, slug: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (items.length < 2) return 0;

  const taken = new Set<string>();
  const updates: Array<{ id: string; slug: string }> = [];

  for (const item of items) {
    const base = itemBaseSlug(item);
    let slug = item.slug?.trim() || base;

    if (isLegacyNumericDuplicateSlug(item)) {
      slug = nextDisambiguatedSlug(base, taken);
    } else if (taken.has(slug)) {
      slug = nextDisambiguatedSlug(base, taken);
    }

    taken.add(slug);
    if (slug !== (item.slug?.trim() || "")) {
      updates.push({ id: item.id, slug });
    }
  }

  if (updates.length === 0) return 0;

  await prisma.$transaction(
    updates.map((entry) =>
      prisma.item.update({
        where: { id: entry.id },
        data: { slug: entry.slug },
      }),
    ),
  );

  return updates.length;
}
