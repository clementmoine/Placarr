import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  shelf: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  item: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

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
});
