import { beforeEach, describe, expect, it, vi } from "vitest";

import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadataObservations";

vi.mock("./fetch", () => ({
  fetchFromAchatMoinsCher: vi.fn(),
  fetchPricesFromAchatMoinsCher: vi.fn(),
}));

import { fetchFromAchatMoinsCher } from "./fetch";
import { achatmoinscherModule } from "./index";

const mockedFetchFromAchatMoinsCher = vi.mocked(fetchFromAchatMoinsCher);

beforeEach(() => {
  mockedFetchFromAchatMoinsCher.mockReset();
});

describe("achatmoinscherModule metadata adapter", () => {
  it("retourne null quand aucun code-barres n'est fourni", async () => {
    const adapter = achatmoinscherModule.createMetadataAdapter?.();
    expect(adapter).toBeTruthy();

    const result = await adapter!.resolve({ name: "", barcode: null });

    expect(result).toBeNull();
    expect(mockedFetchFromAchatMoinsCher).not.toHaveBeenCalled();
  });

  it("émet un metadata observation-first depuis la fiche marketplace", async () => {
    mockedFetchFromAchatMoinsCher.mockResolvedValue([
      {
        name: "Wheelman (PlayStation 3)",
        productId: "12345",
        productUrl: "https://www.achatmoinscher.com/12345.html",
        coverUrl: "https://cdn.example.com/photoProd/zoom/wheelman.jpg",
        priceNew: 3999,
        priceUsed: 1999,
      },
    ]);

    const adapter = achatmoinscherModule.createMetadataAdapter?.();
    const result = await adapter!.resolve({ name: "", barcode: "5021290082728" });

    expect(mockedFetchFromAchatMoinsCher).toHaveBeenCalledWith("5021290082728");
    expect(result).toMatchObject({
      title: "Wheelman (PlayStation 3)",
      barcode: "5021290082728",
      imageUrl: "https://cdn.example.com/photoProd/zoom/wheelman.jpg",
      observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
    });
    expect(result?.attachments).toEqual([
      {
        type: "cover",
        url: "https://cdn.example.com/photoProd/zoom/wheelman.jpg",
        role: "fr",
        source: "achatmoinscher",
      },
    ]);
    expect(result?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "listing_title",
          value: "Wheelman (PlayStation 3)",
          language: "fr",
          provenance: expect.objectContaining({
            providerId: "achatmoinscher",
            sourceDocumentRole: "marketplace_listing",
            sourceId: "12345",
            sourceUrl: "https://www.achatmoinscher.com/12345.html",
            evidenceSignals: ["barcode_match", "structured_data"],
          }),
        }),
        expect.objectContaining({
          kind: "image",
          role: "listing_photo",
          type: "cover",
          url: "https://cdn.example.com/photoProd/zoom/wheelman.jpg",
        }),
        expect.objectContaining({
          kind: "offer",
          role: "marketplace_offer",
          condition: "new",
          priceCents: 3999,
          currency: "EUR",
        }),
        expect.objectContaining({
          kind: "offer",
          role: "marketplace_offer",
          condition: "used",
          priceCents: 1999,
          currency: "EUR",
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "barcode",
          idKind: "ean13",
          value: "5021290082728",
        }),
      ]),
    );
  });
});
