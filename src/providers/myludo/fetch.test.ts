import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readMyLudoSearchEvidence = vi.fn();
const promoteMyLudoSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  myLudoSearchEvidenceUrl: (params: {
    type: "search" | "barcode";
    words?: string;
    code?: string;
  }) => {
    const url = new URL("https://www.myludo.fr/views/search/datas.php");
    url.searchParams.set("type", params.type);
    if (params.type === "barcode" && params.code) {
      url.searchParams.set("code", params.code);
    } else if (params.words) {
      url.searchParams.set("words", params.words);
    }
    return url.toString();
  },
  readMyLudoSearchEvidence: (...args: unknown[]) =>
    readMyLudoSearchEvidence(...args),
  promoteMyLudoSearchEvidence: (...args: unknown[]) =>
    promoteMyLudoSearchEvidence(...args),
}));

import axios from "axios";

import {
  mapMyLudoGamePayload,
  parseMyLudoSearchList,
  searchMyLudoHits,
} from "./fetch";
import { mapMyLudoMetadata } from "./resolver";

const mockedGet = vi.mocked(axios.get);

const GAME_PAYLOAD = {
  id: "4503",
  code: "black-stories-morts-de-rire",
  title: "Black Stories - Morts de rire...",
  edition: 2011,
  image: {
    S300: "https://www.myludo.fr/img/jeux/1680490604/300/ae/4503.png",
  },
  age: "14+",
  players: "2 — 24",
  time_min: "15",
  time_max: "15",
  meta: {
    description: "2 — 24 joueurs – 15 minutes – 14+ ans",
  },
  images: [
    {
      published: true,
      image: {
        jpg360: "https://www.myludo.fr/img/medias/1763126827/360/di/86692.jpg",
      },
    },
    {
      published: false,
      image: {
        jpg360: "https://www.myludo.fr/img/medias/hidden/360/di/1.jpg",
      },
    },
  ],
};

beforeEach(() => {
  mockedGet.mockReset();
  readMyLudoSearchEvidence.mockReset();
  promoteMyLudoSearchEvidence.mockReset();
  readMyLudoSearchEvidence.mockResolvedValue(null);
  promoteMyLudoSearchEvidence.mockResolvedValue(undefined);
});

describe("parseMyLudoSearchList", () => {
  it("maps API search rows to product URLs", () => {
    expect(
      parseMyLudoSearchList({
        list: [
          {
            id: "4503",
            code: "black-stories-morts-de-rire",
            title: "Black Stories - Morts de rire...",
          },
        ],
      }),
    ).toEqual([
      {
        gameId: "4503",
        url: "https://www.myludo.fr/#!/game/black-stories-morts-de-rire-4503",
        title: "Black Stories - Morts de rire",
      },
    ]);
  });
});

describe("mapMyLudoGamePayload", () => {
  it("maps official cover and published community medias separately", () => {
    const game = mapMyLudoGamePayload(GAME_PAYLOAD);
    expect(game.title).toBe("Black Stories - Morts de rire");
    expect(game.productUrl).toBe(
      "https://www.myludo.fr/#!/game/black-stories-morts-de-rire-4503",
    );
    expect(game.imageUrl).toBe(
      "https://www.myludo.fr/img/jeux/1680490604/300/ae/4503.png",
    );
    expect(game.mediaImages).toEqual([
      "https://www.myludo.fr/img/medias/1763126827/360/di/86692.jpg",
    ]);
    expect(game.players).toBe("2 — 24");
    expect(game.playtime).toBe("15 min");
    expect(game.ageRating).toBe("14+");
    expect(game.year).toBe("2011");
  });

  it("maps cover when the API returns images=false instead of an array", () => {
    const game = mapMyLudoGamePayload({
      ...GAME_PAYLOAD,
      images: false as unknown as (typeof GAME_PAYLOAD)["images"],
    });
    expect(game.title).toBe("Black Stories - Morts de rire");
    expect(game.imageUrl).toBe(
      "https://www.myludo.fr/img/jeux/1680490604/300/ae/4503.png",
    );
    expect(game.mediaImages).toBeUndefined();
  });
});

describe("mapMyLudoMetadata attachments", () => {
  it("labels community medias as image/user_photo, not cover", () => {
    const metadata = mapMyLudoMetadata(
      mapMyLudoGamePayload({
        id: "4503",
        code: "black-stories-morts-de-rire",
        title: "Black Stories - Morts de rire",
        edition: 2011,
        image: {
          S300: "https://www.myludo.fr/img/jeux/1680490604/300/ae/4503.png",
        },
        images: [
          {
            published: true,
            image: {
              jpg360:
                "https://www.myludo.fr/img/medias/1763126827/360/di/86692.jpg",
            },
          },
        ],
        meta: { description: "test" },
      }),
    );

    expect(metadata.attachments).toEqual([
      {
        type: "cover",
        url: "https://www.myludo.fr/img/jeux/1680490604/300/ae/4503.png",
        role: "fr",
        source: "myludo",
      },
      {
        type: "image",
        url: "https://www.myludo.fr/img/medias/1763126827/360/di/86692.jpg",
        role: "fr",
        source: "myludo",
        coverProvenance: "user_photo",
      },
    ]);
  });
});

describe("searchMyLudoHits", () => {
  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        gameId: "4503",
        url: "https://www.myludo.fr/#!/game/black-stories-morts-de-rire-4503",
        title: "Black Stories - Morts de rire",
      },
    ];
    readMyLudoSearchEvidence.mockResolvedValueOnce(hits);

    await expect(searchMyLudoHits("Black Stories")).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteMyLudoSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet
      .mockResolvedValueOnce({
        status: 200,
        data: '<meta name="csrf-token" content="token">',
        headers: { "set-cookie": ["MYLUDO_SESSID=abc"] },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: {
          list: [
            {
              id: "4503",
              code: "black-stories-morts-de-rire",
              title: "Black Stories - Morts de rire...",
            },
          ],
        },
      } as never);

    const hits = await searchMyLudoHits("Black Stories");
    expect(hits[0]?.gameId).toBe("4503");
    expect(promoteMyLudoSearchEvidence).toHaveBeenCalledWith(
      expect.stringContaining("type=search"),
      expect.arrayContaining([expect.objectContaining({ gameId: "4503" })]),
    );
  });
});
