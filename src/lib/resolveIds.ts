import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slugs";

/**
 * Résout un identifiant d'étagère qui peut être soit un cuid direct,
 * soit un slug dérivé du nom (les URLs publiques utilisent des slugs).
 *
 * NOTE perf: le fallback slug fait actuellement un scan de table. Il sera
 * remplacé par une colonne `slug` indexée (cf. resolveIds + schema).
 */
export async function resolveShelfId(value: string): Promise<string> {
  const direct = await prisma.shelf.findUnique({
    where: { id: value },
    select: { id: true },
  });
  if (direct) return direct.id;

  const shelves = await prisma.shelf.findMany({
    select: { id: true, name: true },
  });
  return shelves.find((shelf) => slugify(shelf.name) === value)?.id || value;
}

/**
 * Résout un identifiant d'item (cuid direct ou slug). Quand `shelfValue`
 * est fourni, la recherche par slug est restreinte à cette étagère.
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
  const items = await prisma.item.findMany({
    where: resolvedShelfId ? { shelfId: resolvedShelfId } : undefined,
    select: { id: true, name: true },
  });
  return items.find((item) => slugify(item.name) === value)?.id || value;
}
