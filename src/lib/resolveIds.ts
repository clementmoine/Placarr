import { prisma } from "@/lib/prisma";

/**
 * Résout un identifiant d'étagère : cuid direct ou slug dérivé du nom.
 * Une seule requête indexée (PK `id` + index `slug`).
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
  return shelf?.id ?? value;
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
  const item = await prisma.item.findFirst({
    where: {
      slug: value,
      ...(resolvedShelfId ? { shelfId: resolvedShelfId } : {}),
      ...(userId ? { userId } : {}),
    },
    select: { id: true },
  });
  return item?.id ?? value;
}
