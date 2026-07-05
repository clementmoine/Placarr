import { describe, expect, it } from "vitest";

import { mapMyLudoGamePayload, parseMyLudoSearchList } from "./fetch";
import { mapMyLudoMetadata } from "./resolver";

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
