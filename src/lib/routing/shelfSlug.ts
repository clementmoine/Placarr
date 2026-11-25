import { prisma } from "@/lib/db/prisma";

import { slugify } from "./slugs";

/*
  Le slug d'une étagère est son URL (`/shelves/naruto-ninja-ranks`). Il doit
  être unique par utilisateur : deux étagères nommées pareil produisaient le
  même slug, et `resolveShelfId` ouvrait toujours la première — la seconde
  devenait inaccessible. La première garde le slug du nom, les suivantes
  prennent `-2`, `-3`… (même convention que le renommage d'une copie de
  fichier ; un nom qui finit déjà par un nombre est simplement sauté).
*/

function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Slug unique parmi les étagères de `userId` (création ou renommage). */
export async function allocateUniqueShelfSlug(
  userId: string,
  name: string,
  options: { excludeShelfId?: string } = {},
): Promise<string> {
  const base = slugify(name);
  if (!base) return "";

  const others = await prisma.shelf.findMany({
    where: {
      userId,
      ...(options.excludeShelfId
        ? { id: { not: options.excludeShelfId } }
        : {}),
    },
    select: { slug: true, name: true },
  });
  const taken = new Set<string>();
  for (const shelf of others) {
    const slug = shelf.slug?.trim() || slugify(shelf.name);
    if (slug) taken.add(slug);
  }
  return nextFreeSlug(base, taken);
}

/**
 * Répare les étagères existantes d'un utilisateur : slugs en double (créées
 * avant l'allocation unique) ou manquants. La plus ancienne garde son slug,
 * les suivantes sont départagées. Renvoie le nombre d'étagères modifiées.
 */
export async function reconcileDuplicateShelfSlugs(
  userId: string,
): Promise<number> {
  const shelves = await prisma.shelf.findMany({
    where: { userId },
    select: { id: true, name: true, slug: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const taken = new Set<string>();
  const updates: Array<{ id: string; slug: string }> = [];
  for (const shelf of shelves) {
    const current = shelf.slug?.trim() || "";
    const base = current || slugify(shelf.name);
    if (!base) continue;
    const slug = nextFreeSlug(base, taken);
    taken.add(slug);
    if (slug !== current) updates.push({ id: shelf.id, slug });
  }

  if (updates.length === 0) return 0;
  await prisma.$transaction(
    updates.map(({ id, slug }) =>
      prisma.shelf.update({ where: { id }, data: { slug } }),
    ),
  );
  return updates.length;
}
