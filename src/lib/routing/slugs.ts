import { unpaddedVolumeNumbersInTitle } from "@/lib/title/volumeNumber";

export function slugify(value?: string | null): string {
  if (!value) return "";

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Slug for shelf items: display name keeps zero-padding, URLs do not. */
export function slugifyItemName(value?: string | null): string {
  if (!value) return "";
  return slugify(unpaddedVolumeNumbersInTitle(value));
}

const ITEM_SLUG_VOLUME_TAIL =
  /^(.*-(?:n|no|tome|vol|num|chapitre|chapter|partie|part|pt)-)(\d+)$/i;

/** Accepts both `…-n-36` and legacy `…-n-036` item URLs. */
export function itemSlugLookupVariants(slug: string): string[] {
  const variants = new Set<string>([slug]);
  const volumeTail = slug.match(ITEM_SLUG_VOLUME_TAIL);
  if (!volumeTail) return [...variants];

  const [, prefix, digits] = volumeTail;
  const volume = Number.parseInt(digits, 10);
  variants.add(`${prefix}${volume}`);
  for (const width of [2, 3, 4]) {
    variants.add(`${prefix}${String(volume).padStart(width, "0")}`);
  }

  return [...variants];
}

function parseMetadataAliasLabels(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

/** Slugs accepted for item URL resolution (stored slug, names, metadata labels). */
export function itemLookupSlugs(item: {
  name?: string | null;
  slug?: string | null;
  metadata?: { title?: string | null; aliases?: string | null } | null;
}): string[] {
  const slugs = new Set<string>();
  for (const label of [
    item.slug,
    item.name,
    item.metadata?.title,
    ...parseMetadataAliasLabels(item.metadata?.aliases),
  ]) {
    if (!label?.trim()) continue;
    const slug = slugifyItemName(label);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

export function shelfPath(shelf: {
  id: string;
  name?: string | null;
  slug?: string | null;
}): string {
  return `/shelves/${shelf.slug || slugify(shelf.name) || shelf.id}`;
}

export function itemPath(
  shelf: { id: string; name?: string | null; slug?: string | null },
  item: { id: string; name?: string | null; slug?: string | null },
): string {
  return `${shelfPath(shelf)}/${item.slug || slugifyItemName(item.name) || item.id}`;
}
