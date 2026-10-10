import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  shelf: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  item: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const resolveUniquePrintCandidate = vi.hoisted(() => vi.fn());

vi.mock("@/core/identify/printSearch", async () => {
  const actual = await vi.importActual<
    typeof import("@/core/identify/printSearch")
  >("@/core/identify/printSearch");
  return {
    ...actual,
    resolveUniquePrintCandidate,
  };
});

import { resolveItemId, resolveShelfId } from "./resolveIds";

describe("resolveShelfId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the indexed id/slug match first", async () => {
    prismaMock.shelf.findFirst.mockResolvedValue({ id: "shelf-1" });

    await expect(resolveShelfId("xbox-original", "user-1")).resolves.toBe(
      "shelf-1",
    );
    expect(prismaMock.shelf.findMany).not.toHaveBeenCalled();
  });

  it("falls back to a slug computed from the shelf name", async () => {
    prismaMock.shelf.findFirst.mockResolvedValue(null);
    prismaMock.shelf.findMany.mockResolvedValue([
      { id: "shelf-atari", name: "Atari 2600" },
      { id: "shelf-xbox", name: "Xbox Original" },
    ]);

    await expect(resolveShelfId("xbox-original", "user-1")).resolves.toBe(
      "shelf-xbox",
    );
    expect(prismaMock.shelf.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true, name: true },
    });
  });
});

describe("resolveItemId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.shelf.findFirst.mockResolvedValue({ id: "shelf-ps4" });
    resolveUniquePrintCandidate.mockReset();
  });

  it("resolves a unique slug prefix on the shelf", async () => {
    prismaMock.item.findUnique.mockResolvedValue(null);
    prismaMock.item.findFirst.mockResolvedValue(null);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-ninjago",
        name: "LEGO NINJAGO, le film : le jeu vidéo",
        slug: "lego-ninjago-le-film-le-jeu-video",
        metadata: null,
      },
    ]);

    await expect(
      resolveItemId("lego-ninjago", "playstation-4", "user-1"),
    ).resolves.toBe("item-ninjago");
  });

  it("resolves a metadata alias slug on the shelf", async () => {
    prismaMock.item.findUnique.mockResolvedValue(null);
    prismaMock.item.findFirst.mockResolvedValue(null);
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-guardians",
        name: "Marvel's Guardians of the Galaxy: The Telltale Series",
        slug: "marvel-s-guardians-of-the-galaxy-the-telltale-series",
        metadata: {
          title: "Marvel's Guardians of the Galaxy: The Telltale Series",
          aliases: JSON.stringify([
            "Les Gardiens de la Galaxie - The Telltale Series",
          ]),
        },
      },
    ]);

    await expect(
      resolveItemId(
        "les-gardiens-de-la-galaxie-the-telltale-series",
        "playstation-4",
        "user-1",
      ),
    ).resolves.toBe("item-guardians");
  });

  it("resolves canonical volume slugs against long stored manga slugs", async () => {
    prismaMock.item.findUnique.mockResolvedValue(null);
    prismaMock.item.findFirst.mockResolvedValue(null);
    prismaMock.shelf.findFirst.mockResolvedValue({ id: "shelf-mangas" });
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-dbz-1",
        name: "Dragon Ball Z 1 . \r\n 1re partie : Les Saïyens 1",
        slug: "dragon-ball-z-1-1re-partie-les-saiyens-1",
        metadata: {
          title: "Dragon Ball Z 1 . \r\n 1re partie : Les Saïyens 1",
          aliases: JSON.stringify([
            "Dragon Ball Z - 1re partie - Tome 01: Les Saïyens - Toriyama, Akira",
          ]),
        },
      },
    ]);

    await expect(
      resolveItemId("dragon-ball-z-n-1", "mangas", "user-1"),
    ).resolves.toBe("item-dbz-1");
  });

  it("resolves disambiguated duplicate slugs to distinct items", async () => {
    prismaMock.item.findUnique.mockResolvedValue(null);
    prismaMock.item.findFirst.mockResolvedValue({
      id: "item-nfs-2",
    });
    prismaMock.shelf.findFirst.mockResolvedValue({ id: "shelf-xbox" });

    await expect(
      resolveItemId("need-for-speed-most-wanted-copy-2", "xbox-360", "user-1"),
    ).resolves.toBe("item-nfs-2");
  });

  it("resolves a former collector-code slug via printKey on TCG shelves", async () => {
    prismaMock.item.findUnique.mockResolvedValue(null);
    prismaMock.item.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "item-ariel" });
    prismaMock.item.findMany.mockResolvedValue([
      {
        id: "item-ariel",
        name: "Ariel - Chanteuse exceptionnelle",
        slug: "ariel-chanteuse-exceptionnelle",
        metadata: null,
      },
    ]);
    prismaMock.shelf.findUnique.mockResolvedValue({ type: "tcg" });
    resolveUniquePrintCandidate.mockResolvedValue({
      printKey: "lorcana:1-2",
      title: "Ariel - Chanteuse exceptionnelle",
    });

    await expect(resolveItemId("tfc-2", "lorcana", "user-1")).resolves.toBe(
      "item-ariel",
    );

    expect(resolveUniquePrintCandidate).toHaveBeenCalledWith("TFC#2", "tcg");
    expect(prismaMock.item.findFirst).toHaveBeenLastCalledWith({
      where: {
        shelfId: "shelf-ps4",
        printKey: "lorcana:1-2",
        userId: "user-1",
      },
      select: { id: true },
    });
  });
});
