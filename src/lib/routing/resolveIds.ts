import { prisma } from "@/lib/db/prisma";
import { itemSlugLookupVariants, itemLookupSlugs, slugify, slugifyItemName } from "@/lib/routing/slugs";

/**
 * Résout un identifiant d'étagère : cuid direct ou slug dérivé du nom.
 * D'abord via les colonnes indexées (`id`, `slug`), puis via un slug calculé
 * depuis le nom pour les données créées avant le backfill de `slug`.
 *
 * IMPORTANT (multi-utilisateurs) : les slugs ne sont uniques QUE par
 * utilisateur (deux comptes peuvent avoir une étagère "Nintendo Wii"
 * → même slug). On scope donc par `userId` quand il est fourni, sinon la
 * résolution serait non déterministe entre comptes.
 */
export async function resolveShelfId(
  value: string,
  userId?: string,
): Promise<string> {
  const shelf = await prisma.shelf.findFirst({
    where: {
      OR: [{ id: value }, { slug: value }],
      ...(userId ? { userId } : {}),
    },
    select: { id: true },
  });
  if (shelf) return shelf.id;

  const shelves = await prisma.shelf.findMany({
    where: {
      ...(userId ? { userId } : {}),
    },
    select: { id: true, name: true },
  });
  const shelfWithComputedSlug = shelves.find((s) => slugify(s.name) === value);

  return shelfWithComputedSlug?.id ?? value;
}

/**
 * Résout un identifiant d'item (cuid direct ou slug). Le lookup direct par id
 * reste non scopé (consultation cross-user d'items publics). Le lookup par slug
 * est restreint à l'étagère résolue et, si fourni, à l'utilisateur.
 */
export async function resolveItemId(
  value: string,
  shelfValue?: string | null,
  userId?: string,
): Promise<string> {
  const direct = await prisma.item.findUnique({
    where: { id: value },
    select: { id: true },
  });
  if (direct) return direct.id;

  const resolvedShelfId = shelfValue
    ? await resolveShelfId(shelfValue, userId)
    : null;
  const slugVariants = itemSlugLookupVariants(value);
  const item = await prisma.item.findFirst({
    where: {
      slug: { in: slugVariants },
      ...(resolvedShelfId ? { shelfId: resolvedShelfId } : {}),
      ...(userId ? { userId } : {}),
    },
    select: { id: true },
  });
  if (item) return item.id;

  if (resolvedShelfId || userId) {
    const candidates = await prisma.item.findMany({
      where: {
        ...(resolvedShelfId ? { shelfId: resolvedShelfId } : {}),
        ...(userId ? { userId } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        metadata: { select: { title: true, aliases: true } },
      },
    });

    const computed = candidates.find((candidate) =>
      itemLookupSlugs(candidate).includes(value),
    );
    if (computed) return computed.id;

    const prefixMatches = candidates.filter((candidate) => {
      const slug = candidate.slug || slugifyItemName(candidate.name);
      return slug === value || slug.startsWith(`${value}-`);
    });
    if (prefixMatches.length === 1) return prefixMatches[0].id;
  }

  return value;
}
