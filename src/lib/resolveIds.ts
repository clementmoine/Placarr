import { prisma } from "@/lib/prisma";

/**
 * Résout un identifiant d'étagère : soit un cuid direct, soit un slug dérivé du
 * nom (les URLs publiques utilisent des slugs). Une seule requête indexée
 * (PK `id` + index `slug`) — plus de scan de table.
 */
export async function resolveShelfId(value: string): Promise<string> {
  const shelf = await prisma.shelf.findFirst({
    where: { OR: [{ id: value }, { slug: value }] },
    select: { id: true },
  });
  return shelf?.id ?? value;
}

/**
 * Résout un identifiant d'item (cuid direct ou slug). Quand `shelfValue` est
 * fourni, la recherche par slug est restreinte à cette étagère. Requêtes
 * indexées (`id`, `slug`, `shelfId`).
 */
export async function resolveItemId(
  value: string,
  shelfValue?: string | null,
): Promise<string> {
  const direct = await prisma.item.findUnique({
    where: { id: value },
    select: { id: true },
  });
  if (direct) return direct.id;

  const resolvedShelfId = shelfValue ? await resolveShelfId(shelfValue) : null;
  const item = await prisma.item.findFirst({
    where: {
      slug: value,
      ...(resolvedShelfId ? { shelfId: resolvedShelfId } : {}),
    },
    select: { id: true },
  });
  return item?.id ?? value;
}
