import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  shelf: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { resolveShelfId } from "./resolveIds";

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
