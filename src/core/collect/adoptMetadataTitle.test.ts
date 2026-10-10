import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    metadata: {
      update: vi.fn(),
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
import {
  adoptItemNameFromMetadataIfPlaceholder,
  syncPrintItemIdentityFromMetadata,
} from "./adoptMetadataTitle";

const mockedUpdate = vi.mocked(prisma.item.update);
const mockedFindUnique = vi.mocked(prisma.item.findUnique);
const mockedMetadataUpdate = vi.mocked(prisma.metadata.update);

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

describe("syncPrintItemIdentityFromMetadata", () => {
  beforeEach(() => {
    mockedUpdate.mockClear();
    mockedFindUnique.mockReset();
    mockedMetadataUpdate.mockClear();
  });

  it("adopts catalog title and printKey when the item was added by code", async () => {
    mockedFindUnique.mockResolvedValue({
      shelfId: "shelf-tcg",
      printKey: null,
      name: "TFC#001",
      metadataId: "meta-1",
      metadata: {
        title: "Ariel - Sur une mission",
        aliases: JSON.stringify(["Ariel - On a Mission"]),
      },
    } as never);

    const adopted = await syncPrintItemIdentityFromMetadata({
      itemId: "item-1",
      shelfType: "tcg",
      itemName: "TFC#001",
      metadataTitle: "Ariel - Sur une mission",
      metadataPrintKey: "lorcana:1-1",
    });

    expect(adopted).toBe(true);
    expect(mockedUpdate).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        printKey: "lorcana:1-1",
        name: "Ariel - Sur une mission",
        slug: "ariel-sur-une-mission",
      },
    });
    expect(mockedMetadataUpdate).toHaveBeenCalledWith({
      where: { id: "meta-1" },
      data: {
        aliases: JSON.stringify(["Ariel - On a Mission", "TFC#001"]),
      },
    });
  });

  it("does not rename an item that already has a printKey", async () => {
    mockedFindUnique.mockResolvedValue({
      shelfId: "shelf-tcg",
      printKey: "lorcana:1-1",
      name: "Mon Ariel",
    } as never);

    const adopted = await syncPrintItemIdentityFromMetadata({
      itemId: "item-1",
      shelfType: "tcg",
      itemName: "Mon Ariel",
      metadataTitle: "Ariel - Sur une mission",
      metadataPrintKey: "lorcana:1-1",
    });

    expect(adopted).toBe(false);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("ignores non-print shelves", async () => {
    const adopted = await syncPrintItemIdentityFromMetadata({
      itemId: "item-1",
      shelfType: "books",
      itemName: "TFC#001",
      metadataTitle: "Ariel",
      metadataPrintKey: "lorcana:1-1",
    });

    expect(adopted).toBe(false);
    expect(mockedFindUnique).not.toHaveBeenCalled();
  });
});
