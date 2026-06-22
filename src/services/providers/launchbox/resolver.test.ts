import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  mapLaunchBoxGameToMetadata,
  pickBestLaunchBoxGame,
  fetchFromLaunchBox,
  tokenizeLaunchBoxQuery,
  buildLaunchBoxFtsQueries,
} from "@/services/providers/launchbox/resolver";
import {
  __resetLaunchBoxIndexForTests,
  __setLaunchBoxIndexForTests,
} from "@/services/providers/launchbox/indexStore";
import type { LaunchBoxGameRecord } from "@/services/providers/launchbox/parse";

describe("tokenizeLaunchBoxQuery", () => {
  it("splits possessive titles without merging tokens", () => {
    expect(tokenizeLaunchBoxQuery("Tom Clancy's Rainbow Six 3")).toEqual([
      "tom",
      "clancy",
      "rainbow",
      "six",
      "3",
    ]);
  });

  it("drops common stop words", () => {
    expect(tokenizeLaunchBoxQuery("Wallace & Gromit in Project Zoo")).toEqual([
      "wallace",
      "gromit",
      "project",
      "zoo",
    ]);
  });
});

describe("buildLaunchBoxFtsQueries", () => {
  it("builds AND queries instead of flooding with OR", () => {
    expect(
      buildLaunchBoxFtsQueries(["tom", "clancy", "rainbow", "six", "3"]),
    ).toEqual([
      "tom* AND clancy* AND rainbow* AND six* AND 3*",
      "rainbow* AND clancy* AND six* AND tom*",
      "rainbow* AND clancy* AND six*",
      "rainbow* AND clancy*",
      "rainbow*",
    ]);
  });
});

describe("pickBestLaunchBoxGame", () => {
  const games: LaunchBoxGameRecord[] = [
    {
      databaseId: 7283,
      name: "GoldenEye: Rogue Agent",
      platform: "Sony Playstation 2",
      alternateNames: [],
      images: [],
    },
    {
      databaseId: 6074,
      name: "GoldenEye: Rogue Agent",
      platform: "Microsoft Xbox",
      alternateNames: [],
      images: [],
    },
  ];

  it("prefers the platform-compatible entry", () => {
    const match = pickBestLaunchBoxGame(
      games,
      "GoldenEye: Rogue Agent",
      "PlayStation 2",
    );
    expect(match?.databaseId).toBe(7283);
  });

  it("matches a regional alternate title", () => {
    const match = pickBestLaunchBoxGame(
      [
        {
          databaseId: 7283,
          name: "GoldenEye: Rogue Agent",
          platform: "Sony Playstation 2",
          alternateNames: [
            {
              databaseId: 7283,
              name: "GoldenEye: Au Service du Mal",
              region: "France",
            },
          ],
          images: [],
        },
      ],
      "Goldeneye: Au Service Du Mal",
      "PlayStation 2",
    );

    expect(match?.databaseId).toBe(7283);
  });

  it("prefers Tekken over Tekken 3 when the base game was requested", () => {
    const match = pickBestLaunchBoxGame(
      [
        {
          databaseId: 2546,
          name: "Tekken 3",
          platform: "Sony Playstation",
          alternateNames: [],
          images: [],
        },
        {
          databaseId: 2612,
          name: "Tekken",
          platform: "Sony Playstation",
          alternateNames: [],
          images: [],
        },
      ],
      "Tekken",
      "PlayStation 1",
    );

    expect(match?.databaseId).toBe(2612);
  });

  it("prefers the requested sequel over the first game", () => {
    const match = pickBestLaunchBoxGame(
      [
        {
          databaseId: 29149,
          name: "Conflict: Desert Storm",
          platform: "Microsoft Xbox",
          alternateNames: [],
          images: [],
        },
        {
          databaseId: 31764,
          name: "Conflict: Desert Storm II: Back to Baghdad",
          platform: "Microsoft Xbox",
          alternateNames: [],
          images: [],
        },
      ],
      "Conflict Desert Storm 2",
      "Xbox Original",
    );

    expect(match?.databaseId).toBe(31764);
  });
});

describe("mapLaunchBoxGameToMetadata", () => {
  it("maps LaunchBox fields, aliases, regional titles and images", () => {
    const metadata = mapLaunchBoxGameToMetadata({
      databaseId: 7283,
      name: "GoldenEye: Rogue Agent",
      platform: "Sony Playstation 2",
      overview: "FPS maléfique.",
      releaseDate: "2005-06-13T00:00:00+00:00",
      publisher: "Electronic Arts",
      developer: "Electronic Arts Los Angeles",
      esrb: "T - Teen",
      communityRating: 3.63,
      communityRatingCount: 41,
      maxPlayers: 8,
      genres: ["Shooter"],
      wikipediaUrl: "https://en.wikipedia.org/wiki/GoldenEye:_Rogue_Agent",
      videoUrl: "https://www.youtube.com/watch?v=abc",
      alternateNames: [
        {
          databaseId: 7283,
          name: "GoldenEye Rogue Agent",
          region: "World",
        },
        {
          databaseId: 7283,
          name: "GoldenEye: Au Service du Mal",
          region: "France",
        },
      ],
      images: [
        {
          databaseId: 7283,
          fileName: "cover-eu.jpg",
          type: "Box - Front",
          region: "Europe",
        },
        {
          databaseId: 7283,
          fileName: "bg.jpg",
          type: "Fanart - Background",
        },
      ],
    });

    expect(metadata.title).toBe("GoldenEye: Rogue Agent");
    expect(metadata.description).toBe("FPS maléfique.");
    expect(metadata.releaseDate).toBe("2005-06-13");
    expect(metadata.imageUrl).toBe(
      "https://images.launchbox-app.com/cover-eu.jpg",
    );
    expect(metadata.aliases).toContain("GoldenEye Rogue Agent");
    expect(metadata.regionalTitles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          region: "France",
          text: "GoldenEye: Au Service du Mal",
        }),
      ]),
    );
    expect(metadata.facts?.some((fact) => fact.kind === "developer")).toBe(
      true,
    );
    expect(metadata.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "players",
          label: "Joueurs max",
          value: "8",
          source: "launchbox",
        }),
      ]),
    );
    expect(metadata.facts?.some((fact) => fact.kind === "video")).toBe(true);
    expect(
      metadata.attachments?.some((entry) => entry.type === "background"),
    ).toBe(true);
    expect(metadata.externalIds?.launchbox).toBe("7283");
  });
});

describe("fetchFromLaunchBox integration with SQLite", () => {
  beforeEach(() => {
    __resetLaunchBoxIndexForTests();
  });

  afterEach(() => {
    __resetLaunchBoxIndexForTests();
  });

  it("returns null if not enabled", async () => {
    const origEnv = process.env.LAUNCHBOX_ENABLED;
    try {
      process.env.LAUNCHBOX_ENABLED = "0";
      const result = await fetchFromLaunchBox("GoldenEye: Rogue Agent");
      expect(result).toBeNull();
    } finally {
      process.env.LAUNCHBOX_ENABLED = origEnv;
    }
  });

  it("finds a game via alternate name and returns images", async () => {
    __setLaunchBoxIndexForTests([
      {
        databaseId: 7283,
        name: "GoldenEye: Rogue Agent",
        platform: "Sony Playstation 2",
        overview: "Why save the world when you can rule it?",
        releaseDate: "2005-06-13T00:00:00+00:00",
        publisher: "Electronic Arts",
        alternateNames: [
          {
            databaseId: 7283,
            name: "GoldenEye Rogue Agent",
            region: "World",
          },
        ],
        images: [
          {
            databaseId: 7283,
            fileName: "cover.jpg",
            type: "Box - Front",
            region: "Europe",
          },
        ],
      },
    ]);

    const result = await fetchFromLaunchBox(
      "GoldenEye Rogue Agent",
      "PlayStation 2",
    );
    expect(result).not.toBeNull();
    expect(result?.title).toBe("GoldenEye: Rogue Agent");
    expect(result?.imageUrl).toContain("cover.jpg");
  });

  it("finds Rainbow Six 3 on Xbox when the title uses an apostrophe", async () => {
    __setLaunchBoxIndexForTests([
      {
        databaseId: 8037,
        name: "Tom Clancy's Rainbow Six 3: Black Arrow",
        platform: "Microsoft Xbox",
        alternateNames: [],
        images: [],
      },
      {
        databaseId: 14606,
        name: "Tom Clancy's Rainbow Six 3",
        platform: "Microsoft Xbox",
        overview: "Tactical shooter on Xbox.",
        alternateNames: [],
        images: [],
      },
    ]);

    const result = await fetchFromLaunchBox(
      "Tom Clancy's Rainbow Six 3",
      "Xbox Original",
    );

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Tom Clancy's Rainbow Six 3");
    expect(result?.externalIds?.launchbox).toBe("14606");
  });
});
