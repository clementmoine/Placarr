import { parsePrintKey } from "@/core/identify/printKey";
import {
  normalizeVolumeNumber,
  unpaddedVolumeNumbersInTitle,
  volumeNumberFromTitle,
} from "@/core/enrich/titles/volumeNumber";

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

/** Parses `dragon-ball-z-n-1` → `{ seriesPrefix: "dragon-ball-z", volume: "1" }`. */
export function parseVolumeItemSlug(
  slug: string,
): { seriesPrefix: string; volume: string } | null {
  const volumeTail = slug.match(ITEM_SLUG_VOLUME_TAIL);
  if (!volumeTail) return null;

  const [, prefix, digits] = volumeTail;
  const volume = normalizeVolumeNumber(digits);
  if (volume === "NaN") return null;

  const seriesPrefix = prefix.replace(
    /-(?:n|no|tome|vol|num|chapitre|chapter|partie|part|pt)-$/i,
    "",
  );
  if (!seriesPrefix) return null;

  return { seriesPrefix, volume };
}

export function itemMatchesVolumeItemSlug(
  slug: string,
  item: {
    name?: string | null;
    slug?: string | null;
    metadata?: { title?: string | null; aliases?: string | null } | null;
  },
): boolean {
  const parsed = parseVolumeItemSlug(slug);
  if (!parsed) return false;

  const labels = [
    item.name,
    item.metadata?.title,
    ...parseMetadataAliasLabels(item.metadata?.aliases),
  ].filter((label): label is string => Boolean(label?.trim()));

  const volumeMatches = labels.some(
    (label) => volumeNumberFromTitle(label) === parsed.volume,
  );
  if (!volumeMatches) return false;

  const primarySlugs = [
    item.slug,
    item.name ? slugifyItemName(item.name) : null,
    item.metadata?.title ? slugifyItemName(item.metadata.title) : null,
  ].filter((value): value is string => Boolean(value?.trim()));

  return primarySlugs.some(
    (candidate) =>
      candidate === parsed.seriesPrefix ||
      candidate.startsWith(`${parsed.seriesPrefix}-`),
  );
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
/**
 * Le slug d'une carte : sa **référence de collection**, pas son nom.
 *
 * Un nom n'identifie pas une carte. Sur une étagère Naruto, deux objets
 * s'appellent « Naruto Uzumaki » — l'un est `pr-0016` en holo, l'autre
 * `ni-0046` en normal. Le nommage par titre les rendait `naruto-uzumaki` et
 * `naruto-uzumaki-copy-2`, ce qui n'est pas seulement peu lisible : `copy`
 * **affirme** que le second est un exemplaire du premier, alors que ce sont
 * deux cartes différentes.
 *
 * La référence est ce qu'un collectionneur lit sur le carton et ce qu'il tape :
 * `ni-0046`. La finition ne s'y ajoute que là où elle départage — deux
 * exemplaires du **même** tirage, eux, sont bien des copies et retombent sur le
 * suffixe prévu pour ça.
 *
 * **La langue en fait partie**, ajoutée le 2026-08-21. Un tirage porte une seule
 * clé pour toutes ses localisations — c'est ainsi que les sources le modèlent —
 * si bien que l'Inari française et l'イナリ japonaise sortaient toutes deux
 * `cl-0001-normal`, et que la seconde héritait de `-copy-2`. Le suffixe
 * **affirmait** qu'elle dupliquait la première : le défaut même que le nommage
 * par référence avait été écrit pour supprimer, déplacé de l'homonymie vers la
 * langue. 898 clés Naruto et 19 673 clés Pokémon portent plusieurs langues.
 *
 * Elle est écrite **toujours**, pas seulement quand elle départage : sinon
 * l'URL de la carte française changerait le jour où l'on ajoute la japonaise.
 * Un slug ne doit pas dépendre de ce qu'on possède par ailleurs.
 */
export function printKeyItemSlug(
  printKey?: string | null,
  variant?: string | null,
  language?: string | null,
): string {
  const identity = parsePrintKey(printKey);
  if (!identity) return "";
  const reference = slugify(`${identity.set}-${identity.number}`);
  if (!reference) return "";
  return [reference, slugify(language), slugify(variant)]
    .filter(Boolean)
    .join("-");
}

export function itemLookupSlugs(item: {
  name?: string | null;
  slug?: string | null;
  printKey?: string | null;
  variant?: string | null;
  language?: string | null;
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
  /*
    Les formes par référence sont **reconnues** même quand le slug rangé est un
    ancien slug par nom : c'est ce qui laisse les deux URL fonctionner sans
    renommer quoi que ce soit en base, et donc sans casser un lien déjà partagé.
  */
  /*
    Toutes les formes par référence sont reconnues, langue comprise ou non :
    c'est ce qui laisse répondre les URL déjà partagées quand un item est
    re-slugué, ici parce que la langue est entrée dans le slug.
  */
  for (const withLanguage of [item.language, null]) {
    for (const withVariant of [item.variant, null]) {
      const slug = printKeyItemSlug(item.printKey, withVariant, withLanguage);
      if (slug) slugs.add(slug);
    }
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
