import { beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(h.fetchTheGamesDbById).toHaveBeenCalledWith(109154);
  });
});
