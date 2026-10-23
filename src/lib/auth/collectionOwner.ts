import { UserRole } from "@/generated/prisma/browser";
import { prisma } from "@/lib/db/prisma";

/**
 * Mono-instance owner: the account whose shelves/items are the collection.
 * Anonymous visitors and legacy guests browse this collection read-only.
 */
export async function getCollectionOwnerId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: UserRole.admin },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (admin) return admin.id;

  const user = await prisma.user.findFirst({
    where: { role: UserRole.user },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * User id used to scope shelf/item reads.
 * Anonymous / guest → instance owner; unlocked sessions keep their own id.
 */
export async function collectionUserIdFor(auth: {
  id?: string | null;
  role?: UserRole | string | null;
} | null): Promise<string> {
  const role = auth?.role;
  const id = auth?.id ?? "";
  if (
    !auth ||
    !id ||
    role === UserRole.guest ||
    role === "guest" ||
    role == null
  ) {
    return (await getCollectionOwnerId()) ?? id;
  }
  return id;
}

/**
 * Read access: admin, owner of the row, or anonymous/guest browsing the
 * instance owner's collection.
 */
export function canReadOwnedRow(
  auth: { id?: string | null; role?: UserRole | string | null } | null,
  rowUserId: string,
  collectionOwnerId: string | null,
): boolean {
  if (auth?.role === UserRole.admin || auth?.role === "admin") return true;
  if (auth?.id && auth.id === rowUserId) return true;
  if (
    collectionOwnerId != null &&
    rowUserId === collectionOwnerId &&
    (!auth?.id ||
      auth.role === UserRole.guest ||
      auth.role === "guest" ||
      auth.role == null)
  ) {
    return true;
  }
  return false;
}
