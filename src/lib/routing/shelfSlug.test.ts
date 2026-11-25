import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  shelf: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import {
  allocateUniqueShelfSlug,
  reconcileDuplicateShelfSlugs,
} from "./shelfSlug";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  prismaMock.shelf.update.mockImplementation((args: unknown) => args);
});

describe("allocateUniqueShelfSlug", () => {
  it("garde le slug du nom quand il est libre", async () => {
    prismaMock.shelf.findMany.mockResolvedValue([]);

    await expect(
      allocateUniqueShelfSlug("u1", "Naruto Ninja Ranks"),
    ).resolves.toBe("naruto-ninja-ranks");
  });

  it("départage une seconde étagère homonyme", async () => {
    prismaMock.shelf.findMany.mockResolvedValue([
      { slug: "naruto-ninja-ranks", name: "Naruto Ninja Ranks" },
    ]);

    await expect(
      allocateUniqueShelfSlug("u1", "Naruto Ninja Ranks"),
    ).resolves.toBe("naruto-ninja-ranks-2");
  });

  it("saute les suffixes déjà pris, y compris un nom qui finit par un nombre", async () => {
    prismaMock.shelf.findMany.mockResolvedValue([
      { slug: "mangas", name: "Mangas" },
      { slug: "mangas-2", name: "Mangas 2" },
    ]);

    await expect(allocateUniqueShelfSlug("u1", "Mangas")).resolves.toBe(
      "mangas-3",
    );
  });

  it("compte le slug calculé d'une étagère sans slug persisté", async () => {
    prismaMock.shelf.findMany.mockResolvedValue([
      { slug: null, name: "Mangas" },
    ]);

    await expect(allocateUniqueShelfSlug("u1", "Mangas")).resolves.toBe(
      "mangas-2",
    );
  });

  it("limite la recherche à l'utilisateur et exclut l'étagère renommée", async () => {
    prismaMock.shelf.findMany.mockResolvedValue([]);

    await allocateUniqueShelfSlug("u1", "Mangas", { excludeShelfId: "s1" });

    expect(prismaMock.shelf.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      id: { not: "s1" },
    });
  });
});

describe("reconcileDuplicateShelfSlugs", () => {
  it("la plus ancienne garde le slug, les suivantes sont départagées", async () => {
    prismaMock.shelf.findMany.mockResolvedValue([
      { id: "a", name: "Naruto Ninja Ranks", slug: "naruto-ninja-ranks" },
      { id: "b", name: "Naruto Ninja Ranks", slug: "naruto-ninja-ranks" },
    ]);

    await expect(reconcileDuplicateShelfSlugs("u1")).resolves.toBe(1);
    expect(prismaMock.shelf.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.shelf.update).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { slug: "naruto-ninja-ranks-2" },
    });
  });

  it("remplit les slugs manquants sans toucher aux étagères déjà uniques", async () => {
    prismaMock.shelf.findMany.mockResolvedValue([
      { id: "a", name: "Mangas", slug: "mangas" },
      { id: "b", name: "Jeux", slug: null },
    ]);

    await expect(reconcileDuplicateShelfSlugs("u1")).resolves.toBe(1);
    expect(prismaMock.shelf.update).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { slug: "jeux" },
    });
  });

  it("ne fait rien quand tout est déjà unique", async () => {
    prismaMock.shelf.findMany.mockResolvedValue([
      { id: "a", name: "Mangas", slug: "mangas" },
      { id: "b", name: "Jeux", slug: "jeux" },
    ]);

    await expect(reconcileDuplicateShelfSlugs("u1")).resolves.toBe(0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
