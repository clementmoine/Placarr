import { beforeEach, describe, expect, it, vi } from "vitest";

import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadata/observations";

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));

import axios from "axios";

import { createDeezerResolver } from "./resolver";

const mockedGet = vi.mocked(axios.get);

const DISCOVERY_ALBUM = {
  id: 302127,
  title: "Discovery",
  upc: "5099751258726",
  link: "https://www.deezer.com/album/302127",
  label: "Daft Life Ltd.",
  duration: 3660,
  nb_tracks: 14,
  release_date: "2001-03-07",
  cover_big: "https://e-cdns-images.dzcdn.net/images/cover/discovery.jpg",
  contributors: [
    {
      name: "Daft Punk",
      picture_xl: "https://e-cdns-images.dzcdn.net/images/artist/daftpunk.jpg",
    },
  ],
  tracks: {
    data: [
      {
        title: "One More Time",
        duration: 320,
        preview: "https://cdns-preview-1.dzcdn.net/stream/c-1.mp3",
      },
    ],
  },
  genres: { data: [{ name: "Electronic" }] },
  fans: 123456,
  available: true,
  explicit_lyrics: false,
  explicit_content_lyrics: false,
  explicit_content_cover: false,
};

const HOMEWORK_ALBUM = {
  id: 302128,
  title: "Homework",
  upc: "5099749607220",
  link: "https://www.deezer.com/album/302128",
  label: "Virgin",
  duration: 4490,
  nb_tracks: 16,
  release_date: "1997-01-20",
  cover_big: "https://e-cdns-images.dzcdn.net/images/cover/homework.jpg",
  contributors: [{ name: "Daft Punk" }],
  tracks: { data: [] },
};

beforeEach(() => {
  mockedGet.mockReset();
});

describe("createDeezerResolver", () => {
  it("résout un album par UPC et émet le contrat observation-first", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url === "https://api.deezer.com/album/upc:5099751258726") {
        return {
          data: {
            id: 302127,
            title: "Discovery",
            artist: { name: "Daft Punk" },
          },
        } as never;
      }
      if (url === "https://api.deezer.com/album/302127") {
        return { data: DISCOVERY_ALBUM } as never;
      }
      return { data: {} } as never;
    });

    const resolve = createDeezerResolver();
    const result = await resolve("", "5099751258726");

    expect(result).toMatchObject({
      title: "Daft Punk - Discovery",
      barcode: "5099751258726",
      releaseDate: "2001-03-07",
      tracksCount: 14,
      observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
    });
    expect(result?.attachments).toEqual([
      {
        type: "cover",
        url: "https://e-cdns-images.dzcdn.net/images/cover/discovery.jpg",
        source: "deezer",
      },
      {
        type: "audio",
        title: "One More Time",
        duration: 320,
        url: "https://cdns-preview-1.dzcdn.net/stream/c-1.mp3",
        source: "deezer",
      },
    ]);
    expect(result?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "object_title",
          value: "Daft Punk - Discovery",
          provenance: expect.objectContaining({
            providerId: "deezer",
            sourceDocumentRole: "api_object",
            sourceId: "302127",
            evidenceSignals: ["structured_data", "barcode_match"],
          }),
        }),
        expect.objectContaining({
          kind: "alias",
          role: "provider_grouped_alias",
          value: "Discovery",
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          type: "cover",
          url: "https://e-cdns-images.dzcdn.net/images/cover/discovery.jpg",
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "provider_record_id",
          idKind: "deezer",
          value: "302127",
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "barcode",
          idKind: "ean13",
          value: "5099751258726",
        }),
      ]),
    );
    expect(
      (result?.observations || []).filter(
        (observation) => observation.kind === "image",
      ),
    ).toHaveLength(1);
  });

  it("résout par nom via la meilleure distance titre et ajoute title_match", async () => {
    mockedGet.mockImplementation(async (url) => {
      if (url.startsWith("https://api.deezer.com/search/album?q=")) {
        return {
          data: {
            data: [{ id: 302128 }, { id: 302127 }],
          },
        } as never;
      }
      if (url === "https://api.deezer.com/album/302128") {
        return { data: HOMEWORK_ALBUM } as never;
      }
      if (url === "https://api.deezer.com/album/302127") {
        return { data: DISCOVERY_ALBUM } as never;
      }
      return { data: {} } as never;
    });

    const resolve = createDeezerResolver();
    const result = await resolve("Discovery");

    expect(result?.title).toBe("Discovery");
    expect(result?.observationSchemaVersion).toBe(
      METADATA_OBSERVATION_SCHEMA_VERSION,
    );
    expect(result?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "object_title",
          value: "Discovery",
          provenance: expect.objectContaining({
            evidenceSignals: ["structured_data", "title_match"],
          }),
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "barcode",
          idKind: "ean13",
          value: "5099751258726",
        }),
      ]),
    );
  });

  it("retourne null quand la recherche Deezer est vide", async () => {
    mockedGet.mockResolvedValue({ data: { data: [] } } as never);

    const resolve = createDeezerResolver();

    await expect(resolve("Inconnu")).resolves.toBeNull();
  });
});
