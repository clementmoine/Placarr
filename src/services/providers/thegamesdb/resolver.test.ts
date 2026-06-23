import { beforeEach, describe, expect, it, vi } from "vitest";
import { METADATA_OBSERVATION_SCHEMA_VERSION } from "@/lib/metadataObservations";

const h = vi.hoisted(() => ({
  searchTheGamesDbByName: vi.fn(),
  fetchTheGamesDbById: vi.fn(),
}));

vi.mock("./fetch", () => ({
  searchTheGamesDbByName: h.searchTheGamesDbByName,
  fetchTheGamesDbById: h.fetchTheGamesDbById,
}));

import { fetchFromTheGamesDB } from "@/services/providers/thegamesdb/resolver";

beforeEach(() => {
  h.searchTheGamesDbByName.mockReset();
  h.fetchTheGamesDbById.mockReset();
});

describe("fetchFromTheGamesDB", () => {
  it("prefers PAL PS2 French title over NTSC entries", async () => {
    h.searchTheGamesDbByName.mockResolvedValue({
      code: 200,
      data: {
        count: 2,
        games: [
          {
            id: 6074,
            game_title: "GoldenEye: Rogue Agent",
            platform: 14,
            region_id: 1,
          },
          {
            id: 109154,
            game_title: "GoldenEye: Au Service Du Mal",
            platform: 14,
            region_id: 6,
          },
        ],
      },
    });
    h.fetchTheGamesDbById.mockResolvedValue({
      code: 200,
      data: {
        games: [
          {
            id: 109154,
            game_title: "GoldenEye: Au Service Du Mal",
            release_date: "2004-11-22",
            platform: 14,
            region_id: 6,
            players: "1-8 Players",
            coop: "Yes",
          },
        ],
      },
      include: {
        boxart: {
          base_url: { original: "https://cdn.example/" },
          data: {
            "109154": [
              {
                id: 1,
                type: "boxart",
                side: "front",
                filename: "boxart/front/109154-1.jpg",
              },
            ],
          },
        },
      },
    });

    const result = await fetchFromTheGamesDB(
      "GoldenEye : Au Service du Mal",
      "Xbox Original",
      "5030931039720",
    );

    expect(result?.title).toBe("GoldenEye: Au Service Du Mal");
    expect(result?.imageUrl).toContain("109154-1.jpg");
    expect(result?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "players",
          label: "Joueurs",
          value: "1-8",
          source: "thegamesdb",
        }),
        expect.objectContaining({
          kind: "cooperative",
          label: "Coop",
          value: "Oui",
          source: "thegamesdb",
        }),
      ]),
    );
    expect(result?.observationSchemaVersion).toBe(
      METADATA_OBSERVATION_SCHEMA_VERSION,
    );
    expect(result?.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "title",
          role: "object_title",
          value: "GoldenEye: Au Service Du Mal",
          provenance: expect.objectContaining({
            providerId: "thegamesdb",
            sourceDocumentRole: "reference_record",
            evidenceSignals: expect.arrayContaining([
              "structured_data",
              "platform_match",
            ]),
          }),
        }),
        expect.objectContaining({
          kind: "image",
          role: "cover_front",
          url: expect.stringContaining("109154-1.jpg"),
        }),
        expect.objectContaining({
          kind: "fact",
          role: "structured_fact",
          factKind: "players",
          value: "1-8",
        }),
        expect.objectContaining({
          kind: "external-id",
          role: "provider_record_id",
          idKind: "thegamesdb",
          value: "109154",
        }),
      ]),
    );
    expect(h.fetchTheGamesDbById).toHaveBeenCalledWith(109154);
  });

  it("keeps the requested sequel over the base game on the same platform", async () => {
    h.searchTheGamesDbByName.mockResolvedValue({
      code: 200,
      data: {
        count: 2,
        games: [
          {
            id: 23520,
            game_title: "Tom Clancy's Ghost Recon",
            platform: 14,
            region_id: 0,
            release_date: "2002-11-11",
          },
          {
            id: 6183,
            game_title: "Tom Clancy's Ghost Recon 2",
            platform: 14,
            region_id: 0,
            release_date: "2004-11-16",
          },
        ],
      },
    });
    h.fetchTheGamesDbById.mockResolvedValue({
      code: 200,
      data: {
        games: [
          {
            id: 6183,
            game_title: "Tom Clancy's Ghost Recon 2",
            release_date: "2004-11-16",
            platform: 14,
            players: "1-4 Players",
          },
        ],
      },
    });

    const result = await fetchFromTheGamesDB(
      "Tom Clancy's Ghost Recon 2",
      "Xbox Original",
      "3307210196804",
    );

    expect(result?.title).toBe("Tom Clancy's Ghost Recon 2");
    expect(result?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "players",
          value: "1-4",
          source: "thegamesdb",
        }),
      ]),
    );
    expect(h.fetchTheGamesDbById).toHaveBeenCalledWith(6183);
  });

  it("identifie correctement les jaquettes verso (back) dans les pièces jointes TGDB", async () => {
    h.searchTheGamesDbByName.mockResolvedValue({
      code: 200,
      data: {
        count: 1,
        games: [{ id: 123, game_title: "Test Game", platform: 14, region_id: 6 }],
      },
    });
    h.fetchTheGamesDbById.mockResolvedValue({
      code: 200,
      data: {
        games: [{ id: 123, game_title: "Test Game", platform: 14 }],
      },
      include: {
        boxart: {
          base_url: { original: "https://cdn.example/" },
          data: {
            "123": [
              { id: 1, type: "boxart", side: "back", filename: "back.jpg" },
              { id: 2, type: "boxart", side: "front", filename: "front.jpg" },
            ],
          },
        },
      },
    });

    const result = await fetchFromTheGamesDB("Test Game", "Xbox Original");
    const backAttachment = result?.attachments?.find((a) => a.url.includes("back.jpg"));
    expect(backAttachment?.role).toBe("back-eu"); // region_id 6 is PAL/EU
    const backObservation = result?.observations?.find(
      (observation) =>
        observation.kind === "image" &&
        observation.url.includes("back.jpg"),
    );
    expect(backObservation).toMatchObject({
      kind: "image",
      role: "cover_back",
      region: "eu",
    });
  });
});
