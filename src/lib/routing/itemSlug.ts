import { prisma } from "@/lib/db/prisma";

import { printKeyItemSlug, slugifyItemName } from "./slugs";

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
  printKey?: string | null;
  variant?: string | null;
  language?: string | null;
  id: string;
}): string {
  /*
    Une carte se nomme par sa référence, pas par son titre : deux cartes
    différentes peuvent porter le même nom, et le suffixe `-copy-N` dirait alors
    d'elles qu'elles sont un même objet en double. Voir `printKeyItemSlug`.
  */
  return (
    printKeyItemSlug(item.printKey, item.variant, item.language) ||
    slugifyItemName(item.name) ||
    item.slug?.trim() ||
    item.id
  );
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
  options: {
    excludeItemId?: string;
    reserved?: Set<string>;
    /**
     * L'identité du tirage, quand l'objet en a une. Elle prend la main sur le
     * nom : deux cartes différentes portent le même titre, et les départager
     * par `-copy-N` reviendrait à dire qu'elles sont un même objet en double.
     */
    print?: {
      printKey?: string | null;
      variant?: string | null;
      /** La langue de l'exemplaire : deux localisations d'une même carte
       *  partagent la clé, et sans elle la seconde devenait une « copie ». */
      language?: string | null;
    } | null;
  } = {},
): Promise<string> {
  const base =
    printKeyItemSlug(
      options.print?.printKey,
      options.print?.variant,
      options.print?.language,
    ) || slugifyItemName(name);
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
    select: {
      id: true,
      name: true,
      slug: true,
      // Sans quoi `itemBaseSlug` ne verrait pas qu'il a affaire à une carte, et
      // deux homonymes repartiraient en `-copy-N` — le mensonge qu'on corrige.
      printKey: true,
      language: true,
      variant: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  /*
    Le garde disait `< 2` du temps où cette passe ne servait qu'à départager des
    doublons. Elle normalise aussi les cartes désormais, et une étagère qui n'en
    contient qu'une a autant besoin de porter sa référence.
  */
  if (items.length === 0) return 0;

  const taken = new Set<string>();
  const updates: Array<{ id: string; slug: string }> = [];

  for (const item of items) {
    const base = itemBaseSlug(item);
    let slug = item.slug?.trim() || base;

    /*
      Une carte porte sa **référence**, toujours : c'est ce qui est imprimé
      dessus, et c'est la seule chose qui la distingue d'une homonyme. Deux
      objets nommés « Naruto Uzumaki » devenaient `naruto-uzumaki` et
      `naruto-uzumaki-copy-2` — or `copy` affirme que le second est un
      exemplaire du premier, alors que ce sont `pr-0016` en holo et `ni-0046`
      en normal, deux cartes différentes.

      Réécrire ne casse pas les liens déjà partagés : `itemLookupSlugs` dérive
      encore le slug par nom, et `/…/inari` continue de résoudre vers `cl-0001`.
      Ce qui disparaît, ce sont les `-copy-N` — des identifiants fabriqués par
      la machine, que personne n'a choisi de partager.
    */
    const isPrint = Boolean(item.printKey) && base !== "";

    if (isPrint) {
      slug = taken.has(base) ? nextDisambiguatedSlug(base, taken) : base;
    } else if (isLegacyNumericDuplicateSlug(item)) {
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
