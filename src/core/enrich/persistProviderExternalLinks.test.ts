import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  metadataFindUnique: vi.fn(),
  metadataUpdate: vi.fn(),
  itemFindMany: vi.fn(),
  itemFindUnique: vi.fn(),
  barcodeCacheFindUnique: vi.fn(),
  priceOfferFindMany: vi.fn(),
  fieldEvidenceFindMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    metadata: {
      findUnique: h.metadataFindUnique,
      update: h.metadataUpdate,
    },
    item: {
      findMany: h.itemFindMany,
      findUnique: h.itemFindUnique,
    },
    barcodeCache: {
      findUnique: h.barcodeCacheFindUnique,
    },
    priceOffer: {
      findMany: h.priceOfferFindMany,
    },
    fieldEvidence: {
      findMany: h.fieldEvidenceFindMany,
    },
  },
}));

vi.mock("@/core/catalog/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/core/catalog/catalog")>();
  return {
    ...actual,
    getProviderModule: vi.fn(actual.getProviderModule),
  };
});

import {
  persistProviderExternalLinksForBarcodeItems,
  persistProviderExternalLinksForMetadata,
  repairProviderExternalLinksForItem,
} from "./persistProviderExternalLinks";
import { getProviderModule } from "@/core/catalog/catalog";

const mockedGetProviderModule = vi.mocked(getProviderModule);

describe("persistProviderExternalLinksForMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.fieldEvidenceFindMany.mockResolvedValue([]);
  });

  it("persists a new external-link from price offer sourceUrl", async () => {
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([]),
    });
    h.metadataUpdate.mockResolvedValue({});

    const result = await persistProviderExternalLinksForMetadata("meta-1", {
      priceOffers: [
        {
          source: "chasseauxlivres",
          sourceUrl:
            "https://www.chasse-aux-livres.fr/prix/B01/black-stories.html",
        },
      ],
    });

    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(h.metadataUpdate.mock.calls[0][0].data.facts);
    expect(
      payload.some(
        (fact: { kind: string; source: string; url: string }) =>
          fact.kind === "external-link" &&
          fact.source === "chasseauxlivres" &&
          fact.url.includes("black-stories"),
      ),
    ).toBe(true);
    expect(result?.some((fact) => fact.kind === "external-link")).toBe(true);
  });

  it("skips DB write when external-link snapshot is unchanged", async () => {
    const existingFacts = [
      {
        kind: "external-link",
        label: "Chasse aux Livres",
        value: "Voir la fiche",
        url: "https://www.chasse-aux-livres.fr/prix/B01/black-stories.html",
        source: "chasseauxlivres",
      },
    ];
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify(existingFacts),
    });

    await persistProviderExternalLinksForMetadata("meta-1", {
      priceOffers: [
        {
          source: "chasseauxlivres",
          sourceUrl:
            "https://www.chasse-aux-livres.fr/prix/B01/black-stories.html",
        },
      ],
    });

    expect(h.metadataUpdate).not.toHaveBeenCalled();
  });

  it("purge un lien LeDénicheur dont le GTIN de page contredit l'item", async () => {
    // Both sync (trusted-catalog check) and async (validateStored…) call
    // getProviderModule — mock for every call, not once.
    mockedGetProviderModule.mockReturnValue({
      info: { nameDatabase: false },
      validateStoredExternalLinkAgainstBarcode: vi.fn(async () => true),
    } as never);
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([
        {
          kind: "external-link",
          label: "LeDénicheur",
          value: "Voir la fiche",
          url: "https://ledenicheur.fr/product.php?p=4955683",
          source: "ledenicheur",
        },
      ]),
    });
    h.metadataUpdate.mockResolvedValue({});

    await persistProviderExternalLinksForMetadata("meta-1", {
      itemBarcode: "0827912079678",
      priceOffers: [],
    });

    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const rawFacts = h.metadataUpdate.mock.calls[0][0].data.facts;
    const payload = rawFacts ? JSON.parse(rawFacts) : [];
    expect(
      payload.some(
        (fact: { source?: string }) => fact.source === "ledenicheur",
      ),
    ).toBe(false);
  });

  it("persists external-links from fieldEvidence sourceUrl", async () => {
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([]),
    });
    h.metadataUpdate.mockResolvedValue({});

    await persistProviderExternalLinksForMetadata("meta-1", {
      fieldEvidence: [
        {
          field: "title",
          source: "Bédéthèque",
          value: "Super Picsou Géant n°1",
          sourceUrl: "https://www.bedetheque.com/album-12345.html",
          priority: 34,
        },
        {
          field: "title",
          source: "Booknode",
          value: "Super Picsou Géant n°1",
          sourceUrl: "https://booknode.com/super_picsou_geant_n_1",
          priority: 34,
        },
      ],
    });

    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(h.metadataUpdate.mock.calls[0][0].data.facts);
    expect(
      payload.some(
        (fact: { kind: string; url: string }) =>
          fact.kind === "external-link" && fact.url.includes("bedetheque.com"),
      ),
    ).toBe(true);
    expect(
      payload.some(
        (fact: { kind: string; url: string }) =>
          fact.kind === "external-link" && fact.url.includes("booknode.com"),
      ),
    ).toBe(true);
  });

  it("adds links from provider metadata inputs", async () => {
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([]),
    });
    h.metadataUpdate.mockResolvedValue({});

    await persistProviderExternalLinksForMetadata("meta-1", {
      providerInputs: [
        {
          providerId: "philibert",
          metadata: {
            facts: [
              {
                kind: "source-url",
                label: "Philibert",
                value: "https://www.philibertnet.com/fr/black-stories.html",
                url: "https://www.philibertnet.com/fr/black-stories.html",
                source: "philibert",
              },
            ],
          },
        },
      ],
    });

    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(h.metadataUpdate.mock.calls[0][0].data.facts);
    expect(
      payload.filter((fact: { kind: string }) => fact.kind === "external-link"),
    ).toHaveLength(1);
  });
});

describe("persistProviderExternalLinksForBarcodeItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fans out price offer links to every item metadata for the barcode", async () => {
    h.itemFindMany.mockResolvedValue([
      { metadataId: "meta-a" },
      { metadataId: "meta-b" },
      { metadataId: "meta-a" },
    ]);
    h.metadataFindUnique.mockResolvedValue({ facts: JSON.stringify([]) });
    h.metadataUpdate.mockResolvedValue({});

    await persistProviderExternalLinksForBarcodeItems("0827912079678", [
      {
        source: "okkazeo",
        sourceUrl: "https://www.okkazeo.com/jeu/black-stories/123.html",
      },
    ]);

    expect(h.itemFindMany).toHaveBeenCalledWith({
      where: { barcode: "0827912079678", metadataId: { not: null } },
      select: { metadataId: true, name: true },
    });
    expect(h.metadataFindUnique).toHaveBeenCalledTimes(2);
    expect(h.metadataUpdate).toHaveBeenCalledTimes(2);
  });
});

describe("repairProviderExternalLinksForItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.fieldEvidenceFindMany.mockResolvedValue([]);
  });

  it("reconciles cached barcode price offers into item metadata", async () => {
    h.itemFindUnique.mockResolvedValue({
      id: "item-1",
      name: "Black Stories",
      barcode: "0827912079678",
      metadataId: "meta-1",
    });
    h.barcodeCacheFindUnique.mockResolvedValue({
      priceOffers: [
        {
          source: "LeDenicheur",
          sourceUrl: "https://ledenicheur.fr/product.php?p=2608098",
          rawValue: { productGtin: "00827912079678" },
        },
      ],
    });
    h.priceOfferFindMany.mockResolvedValue([]);
    h.metadataFindUnique.mockResolvedValue({ facts: JSON.stringify([]) });
    h.metadataUpdate.mockResolvedValue({});

    await repairProviderExternalLinksForItem("item-1");

    expect(h.barcodeCacheFindUnique).toHaveBeenCalledWith({
      where: { barcode: "0827912079678" },
      select: {
        priceOffers: {
          select: { source: true, sourceUrl: true, rawValue: true },
        },
      },
    });
    expect(h.priceOfferFindMany).toHaveBeenCalledWith({
      where: { OR: [{ itemId: "item-1" }, { metadataId: "meta-1" }] },
      orderBy: { observedAt: "desc" },
      take: 24,
      select: { source: true, sourceUrl: true, rawValue: true },
    });
    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(h.metadataUpdate.mock.calls[0][0].data.facts);
    expect(
      payload.some(
        (fact: { source?: string; url?: string }) =>
          fact.url === "https://ledenicheur.fr/product.php?p=2608098",
      ),
    ).toBe(true);
  });

  it("reconciles fieldEvidence product pages into metadata external-links", async () => {
    h.itemFindUnique.mockResolvedValue({
      id: "item-picsou",
      name: "Super Picsou Géant n°1",
      barcode: "",
      metadataId: "meta-picsou",
    });
    h.priceOfferFindMany.mockResolvedValue([]);
    h.fieldEvidenceFindMany.mockResolvedValue([
      {
        field: "external-link:Booknode",
        source: "Booknode",
        value: "Super Picsou Géant n°1",
        sourceUrl: "https://booknode.com/super_picsou_geant_n_1",
        priority: 34,
        confidence: null,
      },
      {
        field: "external-link:Bédéthèque",
        source: "Bédéthèque",
        value: "Super Picsou Géant n°1",
        sourceUrl: "https://www.bedetheque.com/album-99999.html",
        priority: 34,
        confidence: null,
      },
    ]);
    h.metadataFindUnique.mockResolvedValue({ facts: JSON.stringify([]) });
    h.metadataUpdate.mockResolvedValue({});

    await repairProviderExternalLinksForItem("item-picsou");

    expect(h.fieldEvidenceFindMany).toHaveBeenCalledWith({
      where: { metadataId: "meta-picsou" },
      select: {
        field: true,
        source: true,
        value: true,
        sourceUrl: true,
        priority: true,
        confidence: true,
      },
    });
    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(h.metadataUpdate.mock.calls[0][0].data.facts);
    expect(
      payload.filter((fact: { kind: string }) => fact.kind === "external-link"),
    ).toHaveLength(2);
  });

  it("keeps booknode and bedetheque links when price offers are reconciled", async () => {
    h.itemFindUnique.mockResolvedValue({
      id: "item-picsou",
      name: "Super Picsou Géant n°01",
      barcode: "",
      metadataId: "meta-picsou",
    });
    h.priceOfferFindMany.mockResolvedValue([
      {
        source: "eBay",
        sourceUrl: "https://www.ebay.fr/itm/298306332354",
        rawValue: null,
      },
    ]);
    h.fieldEvidenceFindMany.mockResolvedValue([
      {
        field: "external-link:Booknode",
        source: "booknode",
        value: "Voir la fiche",
        sourceUrl: "https://booknode.com/super_picsou_geant_n_1_0379552",
        priority: 34,
        confidence: null,
      },
      {
        field: "external-link:Bédéthèque",
        source: "bedetheque",
        value: "Voir la fiche",
        sourceUrl:
          "https://www.bedetheque.com/BD-Super-Picsou-Geant-Tome-1-Numero-1-478946.html",
        priority: 34,
        confidence: null,
      },
    ]);
    h.metadataFindUnique.mockResolvedValue({
      facts: JSON.stringify([
        {
          kind: "external-link",
          label: "eBay",
          value: "Voir la fiche",
          url: "https://www.ebay.fr/itm/298306332354",
          source: "eBay",
        },
      ]),
    });
    h.metadataUpdate.mockResolvedValue({});

    await repairProviderExternalLinksForItem("item-picsou");

    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(h.metadataUpdate.mock.calls[0][0].data.facts);
    expect(
      payload
        .filter((fact: { kind: string }) => fact.kind === "external-link")
        .map((fact: { source?: string }) => fact.source)
        .sort(),
    ).toEqual(["bedetheque", "booknode", "eBay"]);
  });

  it("reconciles item-scoped price offers when item has no barcode", async () => {
    h.itemFindUnique.mockResolvedValue({
      id: "item-picsou",
      name: "Black Stories",
      barcode: "",
      metadataId: "meta-picsou",
    });
    h.priceOfferFindMany.mockResolvedValue([
      {
        source: "okkazeo",
        sourceUrl: "https://www.okkazeo.com/jeu/black-stories/123.html",
        rawValue: null,
      },
    ]);
    h.metadataFindUnique.mockResolvedValue({ facts: JSON.stringify([]) });
    h.metadataUpdate.mockResolvedValue({});

    await repairProviderExternalLinksForItem("item-picsou");

    expect(h.barcodeCacheFindUnique).not.toHaveBeenCalled();
    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(h.metadataUpdate.mock.calls[0][0].data.facts);
    expect(
      payload.some(
        (fact: { source?: string; url?: string }) =>
          fact.kind === "external-link" &&
          fact.source === "okkazeo" &&
          fact.url?.includes("okkazeo.com"),
      ),
    ).toBe(true);
  });
});
