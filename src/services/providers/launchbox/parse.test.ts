import { describe, expect, it } from "vitest";

import {
  parseLaunchBoxAlternateNameBlock,
  parseLaunchBoxGameBlock,
  parseLaunchBoxImageBlock,
  findNextLaunchBoxBlock,
  extractLaunchBoxBlock,
} from "@/services/providers/launchbox/parse";
import {
  buildLaunchBoxAttachments,
  pickLaunchBoxCoverUrl,
} from "@/services/providers/launchbox/images";

describe("parseLaunchBoxGameBlock", () => {
  it("parses extended game metadata fields", () => {
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
        <ESRB>T - Teen</ESRB>
        <CommunityRating>3.63</CommunityRating>
        <CommunityRatingCount>41</CommunityRatingCount>
        <MaxPlayers>8</MaxPlayers>
        <ReleaseType>Released</ReleaseType>
        <Cooperative>false</Cooperative>
        <VideoURL>https://www.youtube.com/watch?v=abc</VideoURL>
        <WikipediaURL>https://en.wikipedia.org/wiki/GoldenEye:_Rogue_Agent</WikipediaURL>
      </Game>
    `);

    expect(game).toMatchObject({
      databaseId: 7283,
      name: "GoldenEye: Rogue Agent",
      platform: "Sony Playstation 2",
      developer: "Electronic Arts Los Angeles",
      publisher: "Electronic Arts",
      genres: ["Shooter"],
      esrb: "T - Teen",
      communityRating: 3.63,
      communityRatingCount: 41,
      maxPlayers: 8,
      releaseType: "Released",
      cooperative: false,
      videoUrl: "https://www.youtube.com/watch?v=abc",
      wikipediaUrl: "https://en.wikipedia.org/wiki/GoldenEye:_Rogue_Agent",
    });
  });
});

describe("parseLaunchBoxAlternateNameBlock", () => {
  it("parses regional alternate names", () => {
    expect(
      parseLaunchBoxAlternateNameBlock(`
        <GameAlternateName>
          <AlternateName>GoldenEye: Au Service du Mal</AlternateName>
          <DatabaseID>7283</DatabaseID>
          <Region>France</Region>
        </GameAlternateName>
      `),
    ).toEqual({
      databaseId: 7283,
      name: "GoldenEye: Au Service du Mal",
      region: "France",
    });
  });
});

describe("parseLaunchBoxImageBlock", () => {
  it("parses image metadata", () => {
    expect(
      parseLaunchBoxImageBlock(`
        <GameImage>
          <DatabaseID>14606</DatabaseID>
          <FileName>cover.jpg</FileName>
          <Type>Box - Front</Type>
          <Region>Europe</Region>
        </GameImage>
      `),
    ).toEqual({
      databaseId: 14606,
      fileName: "cover.jpg",
      type: "Box - Front",
      region: "Europe",
    });
  });
});

describe("LaunchBox XML block extraction", () => {
  it("finds the earliest supported block in mixed XML", () => {
    const buffer =
      "<LaunchBox><GameAlternateName><AlternateName>Sports Island</AlternateName><DatabaseID>7599</DatabaseID></GameAlternateName><Game><Name>Deca Sports</Name><DatabaseID>7599</DatabaseID><Platform>Nintendo Wii</Platform></Game>";
    const next = findNextLaunchBoxBlock(buffer);
    expect(next?.tag).toBe("GameAlternateName");

    const extracted = extractLaunchBoxBlock(buffer, next!.tag, next!.start);
    expect(parseLaunchBoxAlternateNameBlock(extracted!.block)?.name).toBe(
      "Sports Island",
    );
  });
});

describe("buildLaunchBoxAttachments", () => {
  it("exports every regional box front and still prefers Europe for the default cover", () => {
    const attachments = buildLaunchBoxAttachments([
      {
        databaseId: 1,
        fileName: "na.jpg",
        type: "Box - Front",
        region: "North America",
      },
      {
        databaseId: 1,
        fileName: "eu.jpg",
        type: "Box - Front",
        region: "Europe",
      },
      {
        databaseId: 1,
        fileName: "bg.jpg",
        type: "Fanart - Background",
      },
      {
        databaseId: 1,
        fileName: "logo.png",
        type: "Clear Logo",
      },
      {
        databaseId: 1,
        fileName: "shot.jpg",
        type: "Screenshot - Gameplay",
      },
    ]);

    expect(
      pickLaunchBoxCoverUrl([
        {
          databaseId: 1,
          fileName: "na.jpg",
          type: "Box - Front",
          region: "North America",
        },
        {
          databaseId: 1,
          fileName: "eu.jpg",
          type: "Box - Front",
          region: "Europe",
        },
      ]),
    ).toBe("https://images.launchbox-app.com/eu.jpg");

    expect(
      attachments.some(
        (entry) => entry.type === "cover" && entry.url.endsWith("eu.jpg"),
      ),
    ).toBe(true);
    expect(
      attachments.some(
        (entry) => entry.type === "cover" && entry.role === "eu",
      ),
    ).toBe(true);
    expect(
      attachments.some(
        (entry) => entry.type === "cover" && entry.url.endsWith("na.jpg"),
      ),
    ).toBe(true);
    expect(
      attachments.some(
        (entry) => entry.type === "cover" && entry.role === "us",
      ),
    ).toBe(true);
    expect(attachments.filter((entry) => entry.type === "cover")).toHaveLength(2);
    expect(attachments.some((entry) => entry.type === "background")).toBe(true);
    expect(attachments.some((entry) => entry.type === "logo")).toBe(true);
    expect(attachments.some((entry) => entry.type === "screenshot")).toBe(true);
  });

  it("tags box backs, spines and discs explicitly per region", () => {
    const attachments = buildLaunchBoxAttachments([
      {
        databaseId: 1,
        fileName: "front-eu.jpg",
        type: "Box - Front",
        region: "Europe",
      },
      {
        databaseId: 1,
        fileName: "front-jp.jpg",
        type: "Box - Front",
        region: "Japan",
      },
      {
        databaseId: 1,
        fileName: "back-eu.jpg",
        type: "Box - Back",
        region: "Europe",
      },
      {
        databaseId: 1,
        fileName: "back-jp.jpg",
        type: "Box - Back",
        region: "Japan",
      },
      {
        databaseId: 1,
        fileName: "spine-eu.jpg",
        type: "Box - Spine",
        region: "Europe",
      },
      {
        databaseId: 1,
        fileName: "disc.jpg",
        type: "Disc",
        region: "Europe",
      },
    ]);

    expect(attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "cover",
          title: "Box - Front",
          role: "eu",
          url: "https://images.launchbox-app.com/front-eu.jpg",
        }),
        expect.objectContaining({
          type: "cover",
          title: "Box - Front",
          role: "jp",
          url: "https://images.launchbox-app.com/front-jp.jpg",
        }),
        expect.objectContaining({
          type: "image",
          title: "Box - Back",
          role: "back-eu",
          url: "https://images.launchbox-app.com/back-eu.jpg",
        }),
        expect.objectContaining({
          type: "image",
          title: "Box - Back",
          role: "back-jp",
          url: "https://images.launchbox-app.com/back-jp.jpg",
        }),
        expect.objectContaining({
          type: "image",
          title: "Box - Spine",
          role: "spine-eu",
          url: "https://images.launchbox-app.com/spine-eu.jpg",
        }),
        expect.objectContaining({
          type: "image",
          title: "Disc",
          role: "disc-eu",
          url: "https://images.launchbox-app.com/disc.jpg",
        }),
      ]),
    );
  });
});
