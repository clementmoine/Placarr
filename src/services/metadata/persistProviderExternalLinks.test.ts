import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  metadataFindUnique: vi.fn(),
  metadataUpdate: vi.fn(),
  itemFindMany: vi.fn(),
  itemFindUnique: vi.fn(),
  barcodeCacheFindUnique: vi.fn(),
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
  },
}));

vi.mock("@/services/provider/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/provider/catalog")>();
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
import { getProviderModule } from "@/services/provider/catalog";

const mockedGetProviderModule = vi.mocked(getProviderModule);

describe("persistProviderExternalLinksForMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockedGetProviderModule.mockReturnValueOnce({
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
  });

  it("reconciles cached barcode price offers into item metadata", async () => {
    h.itemFindUnique.mockResolvedValue({
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
    expect(h.metadataUpdate).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(h.metadataUpdate.mock.calls[0][0].data.facts);
    expect(
      payload.some(
        (fact: { source?: string; url?: string }) =>
          fact.url === "https://ledenicheur.fr/product.php?p=2608098",
      ),
    ).toBe(true);
  });
});
