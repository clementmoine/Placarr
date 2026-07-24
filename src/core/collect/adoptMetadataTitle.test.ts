import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/routing/itemSlug", () => ({
  allocateUniqueItemSlug: vi.fn(async (_shelfId: string, title: string) =>
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  ),
}));

import { prisma } from "@/lib/db/prisma";
import { adoptItemNameFromMetadataIfPlaceholder } from "./adoptMetadataTitle";

const mockedUpdate = vi.mocked(prisma.item.update);
const mockedFindUnique = vi.mocked(prisma.item.findUnique);

describe("adoptItemNameFromMetadataIfPlaceholder", () => {
  beforeEach(() => {
    mockedUpdate.mockClear();
    mockedFindUnique.mockReset();
    mockedFindUnique.mockResolvedValue({ shelfId: "shelf-1" } as never);
  });

  it("promotes metadata title when the stored name is still a barcode placeholder", async () => {
    const adopted = await adoptItemNameFromMetadataIfPlaceholder({
      itemId: "item-1",
      metadataTitle: "Black stories - Autour du monde",
      itemName: "0087169139499",
      barcode: "0087169139499",
    });

    expect(adopted).toBe(true);
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        name: "Black stories - Autour du monde",
        slug: "black-stories-autour-du-monde",
      },
    });
  });

  it("promotes metadata title for Objet-prefixed placeholders when a barcode is set", async () => {
    const adopted = await adoptItemNameFromMetadataIfPlaceholder({
      itemId: "item-1",
      metadataTitle: "Black stories - Autour du monde",
      itemName: "Objet 0087169139499",
      barcode: "0087169139499",
    });

    expect(adopted).toBe(true);
    expect(mockedUpdate).toHaveBeenCalled();
  });

  it("promotes metadata title when the name is empty but a barcode is set", async () => {
    const adopted = await adoptItemNameFromMetadataIfPlaceholder({
      itemId: "item-1",
      metadataTitle: "Alice 19th Tome 2",
      itemName: "",
      barcode: "9784091354327",
    });

    expect(adopted).toBe(true);
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        name: "Alice 19th Tome 2",
        slug: "alice-19th-tome-2",
      },
    });
  });

  it("does not adopt a title without a barcode", async () => {
    const adopted = await adoptItemNameFromMetadataIfPlaceholder({
      itemId: "item-1",
      metadataTitle: "Alice 19th Tome 2",
      itemName: "",
      barcode: null,
    });

    expect(adopted).toBe(false);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("does not overwrite a user-provided title", async () => {
    const adopted = await adoptItemNameFromMetadataIfPlaceholder({
      itemId: "item-1",
      metadataTitle: "L'Académie Alice, tome 2",
      itemName: "Alice 19th Tome 2",
      barcode: "9784091354327",
    });

    expect(adopted).toBe(false);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("does not rewrite a noisy user listing title", async () => {
    const adopted = await adoptItemNameFromMetadataIfPlaceholder({
      itemId: "item-1",
      metadataTitle: "Black Stories - Morts de Rire",
      itemName: "Black Stories Morts de Rire FR KikiGagne?KIKIBS06F",
      barcode: "0626570614616",
    });

    expect(adopted).toBe(false);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
