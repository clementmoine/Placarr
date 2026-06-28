import { beforeEach, describe, expect, it, vi } from "vitest";

import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadata/observations";

vi.mock("./fetch", () => ({
  fetchFromDiscogs: vi.fn(),
  getDiscogsAuthParams: vi.fn(),
}));

import { fetchFromDiscogs } from "./fetch";
import { discogsModule } from "./index";

const mockedFetchFromDiscogs = vi.mocked(fetchFromDiscogs);

beforeEach(() => {
  mockedFetchFromDiscogs.mockReset();
});

describe("discogsModule metadata adapter", () => {
  it("retourne null quand le code-barres est absent", async () => {
    const adapter = discogsModule.createMetadataAdapter?.();
    expect(adapter).toBeTruthy();

    const result = await adapter!.resolve({ name: "", barcode: null });

    expect(result).toBeNull();
    expect(mockedFetchFromDiscogs).not.toHaveBeenCalled();
  });

  it("émet un metadata observation-first pour une release Discogs", async () => {
    mockedFetchFromDiscogs.mockResolvedValue({
      id: 14232304,
      title: "Yoko Shimomura - Kingdom Hearts Orchestra - World Tour",
      year: "2019",
      imageUrl: "https://i.discogs.com/primary.jpeg",
      images: [
        {
          url: "https://i.discogs.com/primary.jpeg",
          kind: "primary",
          width: 600,
          height: 546,
        },
        {
          url: "https://i.discogs.com/back.jpeg",
          kind: "secondary",
          width: 600,
          height: 537,
        },
      ],
      country: "Japan",
      label: "Walt Disney Records",
      format: "CD",
      formats: ["CD, Album", "Limited Edition"],
      formatQuantity: 2,
      communityHave: 315,
      communityWant: 140,
      genres: ["Stage & Screen"],
      styles: ["Video Game Music"],
    });

    const adapter = discogsModule.createMetadataAdapter?.();
    const result = await adapter!.resolve({
      name: "",
      barcode: "4988-601467124",
    });

    expect(mockedFetchFromDiscogs).toHaveBeenCalledWith("4988601467124");
    expect(result).toMatchObject({
      title: "Yoko Shimomura - Kingdom Hearts Orchestra - World Tour",
      barcode: "4988601467124",
      releaseDate: "2019-01-01",
      imageUrl: "https://i.discogs.com/primary.jpeg",
      observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
      externalIds: { discogs: "14232304" },
    });
    expect(result?.attachments).toEqual([
      {
        type: "cover",
        url: "https://i.discogs.com/primary.jpeg",
        source: "discogs",
        role: "front",
      },
      {
        type: "image",
        url: "https://i.discogs.com/back.jpeg",
        source: "discogs",
        role: "back",
      },
    ]);
    expect(result?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "object_title",
          value: "Yoko Shimomura - Kingdom Hearts Orchestra - World Tour",
          provenance: expect.objectContaining({
            providerId: "discogs",
            sourceDocumentRole: "reference_record",
            sourceId: "14232304",
            sourceUrl: "https://www.discogs.com/release/14232304",
            evidenceSignals: [
              "barcode_match",
              "structured_data",
              "external_id",
            ],
          }),
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          type: "cover",
          url: "https://i.discogs.com/primary.jpeg",
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_back",
          type: "image",
          url: "https://i.discogs.com/back.jpeg",
        }),
        expect.objectContaining({
          kind: "fact",
          role: "structured_fact",
          factKind: "release-region",
          value: "Japan",
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "provider_record_id",
          idKind: "discogs",
          value: "14232304",
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "barcode",
          idKind: "ean13",
          value: "4988601467124",
        }),
      ]),
    );
    expect(
      (result?.observations || []).filter(
        (observation) => observation.kind === "image",
      ),
    ).toHaveLength(2);
  });
});
