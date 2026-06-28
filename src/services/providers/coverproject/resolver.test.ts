import { beforeEach, describe, expect, it, vi } from "vitest";

import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadata/observations";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("./cdnLookup", () => ({
  fetchCoverFromCoverProjectCdn: vi.fn(),
}));

import axios from "axios";

import { fetchCoverFromCoverProjectCdn } from "./cdnLookup";
import { fetchCoverFromCoverProject, fetchFromCoverProject } from "./resolver";

const mockedAxiosGet = vi.mocked(axios.get);
const mockedFetchCoverFromCoverProjectCdn = vi.mocked(
  fetchCoverFromCoverProjectCdn,
);

beforeEach(() => {
  mockedAxiosGet.mockReset();
  mockedFetchCoverFromCoverProjectCdn.mockReset();
});

describe("fetchCoverFromCoverProject", () => {
  it("utilise en priorité le resolver CDN", async () => {
    mockedFetchCoverFromCoverProjectCdn.mockResolvedValue(
      "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_test_cover.jpg",
    );

    const cover = await fetchCoverFromCoverProject(
      "The Legend of Zelda: Skyward Sword",
      "Nintendo Wii",
    );

    expect(cover).toBe(
      "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_test_cover.jpg",
    );
    expect(mockedAxiosGet).not.toHaveBeenCalled();
  });

  it("fallback sur la recherche HTML si le CDN ne trouve rien", async () => {
    mockedFetchCoverFromCoverProjectCdn.mockResolvedValue(null);
    mockedAxiosGet.mockResolvedValue({
      data: `
        <html>
          <img src="https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_skyward_cover.jpg" />
        </html>
      `,
    } as never);

    const cover = await fetchCoverFromCoverProject(
      "The Legend of Zelda: Skyward Sword",
      "Nintendo Wii",
    );

    expect(cover).toBe(
      "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_skyward_cover.jpg",
    );
    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
  });
});

describe("fetchFromCoverProject", () => {
  it("renvoie un metadata observation-first compatible legacy", async () => {
    mockedFetchCoverFromCoverProjectCdn.mockResolvedValue(
      "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_skyward_cover.jpg",
    );

    const metadata = await fetchFromCoverProject(
      "The Legend of Zelda: Skyward Sword",
      "Nintendo Wii",
    );

    expect(metadata).toMatchObject({
      imageUrl:
        "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_skyward_cover.jpg",
      observationSchemaVersion: METADATA_OBSERVATION_SCHEMA_VERSION,
    });
    expect(metadata?.attachments).toEqual([
      {
        type: "cover",
        url: "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_skyward_cover.jpg",
        source: "coverproject",
        role: "eu",
      },
    ]);
    expect(metadata?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          type: "cover",
          url: "https://coverproject.sfo2.cdn.digitaloceanspaces.com/nintendo_wii/wii_skyward_cover.jpg",
          provenance: expect.objectContaining({
            providerId: "coverproject",
            sourceDocumentRole: "reference_record",
            sourceUrl: "https://www.thecoverproject.net/",
            evidenceSignals: [
              "structured_data",
              "title_match",
              "platform_match",
            ],
          }),
        }),
      ]),
    );
  });
});
