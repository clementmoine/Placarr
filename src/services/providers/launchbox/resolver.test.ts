import { describe, expect, it } from "vitest";

import { parseLaunchBoxGameBlock } from "@/services/providers/launchbox/parse";
import {
  mapLaunchBoxGameToMetadata,
  pickBestLaunchBoxGame,
} from "@/services/providers/launchbox/resolver";
import type { LaunchBoxGameRecord } from "@/services/providers/launchbox/parse";

describe("parseLaunchBoxGameBlock", () => {
  it("parses a LaunchBox game entry with alternate names", () => {
    const game = parseLaunchBoxGameBlock(`
      <Game>
        <Name>GoldenEye: Rogue Agent</Name>
        <DatabaseID>7283</DatabaseID>
        <Platform>Sony Playstation 2</Platform>
        <Overview>Why save the world when you can rule it?</Overview>
        <ReleaseDate>2005-06-13T00:00:00+00:00</ReleaseDate>
        <Developer>Electronic Arts Los Angeles</Developer>
        <Publisher>Electronic Arts</Publisher>
        <Genres>Shooter</Genres>
        <AlternateName>GoldenEye Rogue Agent</AlternateName>
      </Game>
    `);

    expect(game).toEqual({
      databaseId: 7283,
      name: "GoldenEye: Rogue Agent",
      platform: "Sony Playstation 2",
      overview: "Why save the world when you can rule it?",
      releaseDate: "2005-06-13T00:00:00+00:00",
      developer: "Electronic Arts Los Angeles",
      publisher: "Electronic Arts",
      genres: ["Shooter"],
      alternateNames: ["GoldenEye Rogue Agent"],
    });
  });
});

describe("pickBestLaunchBoxGame", () => {
  const games: LaunchBoxGameRecord[] = [
    {
      databaseId: 7283,
      name: "GoldenEye: Rogue Agent",
      platform: "Sony Playstation 2",
      alternateNames: [],
    },
    {
      databaseId: 6074,
      name: "GoldenEye: Rogue Agent",
      platform: "Microsoft Xbox",
      alternateNames: [],
    },
  ];

  it("prefers the platform-compatible entry", () => {
    const match = pickBestLaunchBoxGame(
      games,
      "GoldenEye : Au Service du Mal",
      "PlayStation 2",
    );
    expect(match?.databaseId).toBe(7283);
  });
});

describe("mapLaunchBoxGameToMetadata", () => {
  it("maps LaunchBox fields to metadata result", () => {
    const metadata = mapLaunchBoxGameToMetadata({
      databaseId: 7283,
      name: "GoldenEye: Rogue Agent",
      platform: "Sony Playstation 2",
      overview: "FPS maléfique.",
      releaseDate: "2005-06-13T00:00:00+00:00",
      publisher: "Electronic Arts",
      esrb: "T - Teen",
      communityRating: 3.63,
      genres: ["Shooter"],
      alternateNames: ["GoldenEye Rogue Agent"],
    });

    expect(metadata.title).toBe("GoldenEye: Rogue Agent");
    expect(metadata.description).toBe("FPS maléfique.");
    expect(metadata.releaseDate).toBe("2005-06-13");
    expect(metadata.aliases).toContain("GoldenEye Rogue Agent");
    expect(metadata.externalIds?.launchbox).toBe("7283");
  });
});
