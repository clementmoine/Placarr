import { describe, expect, it } from "vitest";

import {
  resolveBoxFaces,
  resolveDiscFace,
  resolveFlatSleeveFlip,
} from "./resolveBoxFaces";

describe("resolveBoxFaces", () => {
  it("is incomplete until front, back and spine are all present", () => {
    expect(
      resolveBoxFaces([
        { type: "cover", role: "fr", url: "https://ex/front.jpg" },
        { type: "image", role: "back-fr", url: "https://ex/back.jpg" },
      ]),
    ).toEqual({
      complete: false,
      front: "https://ex/front.jpg",
      back: "https://ex/back.jpg",
    });
  });

  it("exposes a flat sleeve flip when only front + back exist (vinyl / LD)", () => {
    const faces = resolveBoxFaces([
      { type: "cover", role: "fr", url: "https://ex/front.jpg" },
      { type: "image", role: "back-fr", url: "https://ex/back.jpg" },
    ]);
    expect(resolveFlatSleeveFlip(faces)).toEqual({
      front: "https://ex/front.jpg",
      back: "https://ex/back.jpg",
    });
  });

  it("prefers the ranked cover as flat-sleeve face when provided", () => {
    const faces = resolveBoxFaces([
      { type: "cover", role: "fr", url: "https://ex/front-lddb.jpg" },
      { type: "image", role: "back-fr", url: "https://ex/back.jpg" },
    ]);
    expect(
      resolveFlatSleeveFlip(faces, {
        preferredFrontUrl: "https://ex/ranked-cdandlp.jpg",
      }),
    ).toEqual({
      front: "https://ex/ranked-cdandlp.jpg",
      back: "https://ex/back.jpg",
    });
  });

  it("does not flat-flip when GameBox3D already has a real spine", () => {
    const faces = resolveBoxFaces([
      { type: "cover", role: "fr", url: "https://ex/front.jpg" },
      { type: "image", role: "back-fr", url: "https://ex/back.jpg" },
      { type: "image", role: "spine-fr", url: "https://ex/spine.jpg" },
    ]);
    expect(faces.complete).toBe(true);
    expect(resolveFlatSleeveFlip(faces)).toBeNull();
  });

  it("completes when ScreenScraper-style front/back/spine are present", () => {
    // Golden: the three flat SS scans ROMM RBox3D needs — box-2D, box-2D-back,
    // box-2D-side mapped to cover / back-* / spine-* roles.
    expect(
      resolveBoxFaces([
        {
          type: "cover",
          role: "eu",
          url: "https://media.screenscraper.fr/box-2D-eu.jpg",
          source: "screenscraper",
        },
        {
          type: "image",
          role: "back-eu",
          url: "https://media.screenscraper.fr/box-2D-back-eu.jpg",
          source: "screenscraper",
        },
        {
          type: "image",
          role: "spine-eu",
          url: "https://media.screenscraper.fr/box-2D-side-eu.jpg",
          source: "screenscraper",
        },
        {
          type: "cover",
          role: "3d-eu",
          url: "https://media.screenscraper.fr/box-3D-eu.jpg",
          source: "screenscraper",
        },
      ]),
    ).toEqual({
      complete: true,
      front: "https://media.screenscraper.fr/box-2D-eu.jpg",
      back: "https://media.screenscraper.fr/box-2D-back-eu.jpg",
      spine: "https://media.screenscraper.fr/box-2D-side-eu.jpg",
    });
  });

  it("ignores pre-rendered cover3d / grid faces as box sides", () => {
    const result = resolveBoxFaces([
      {
        type: "cover",
        role: "3d-fr",
        url: "https://ex/box-3d.jpg",
        title: "Box - 3D",
      },
      { type: "image", role: "back-fr", url: "https://ex/back.jpg" },
      { type: "image", role: "spine-fr", url: "https://ex/spine.jpg" },
    ]);
    expect(result.complete).toBe(false);
    expect(result).not.toHaveProperty("front");
  });

  it("prefers the requested region when several faces compete", () => {
    expect(
      resolveBoxFaces(
        [
          { type: "cover", role: "us", url: "https://ex/front-us.jpg" },
          { type: "cover", role: "fr", url: "https://ex/front-fr.jpg" },
          { type: "image", role: "back-us", url: "https://ex/back-us.jpg" },
          { type: "image", role: "back-fr", url: "https://ex/back-fr.jpg" },
          { type: "image", role: "spine-us", url: "https://ex/spine-us.jpg" },
          { type: "image", role: "spine-fr", url: "https://ex/spine-fr.jpg" },
        ],
        { preferredRegion: "fr" },
      ),
    ).toEqual({
      complete: true,
      front: "https://ex/front-fr.jpg",
      back: "https://ex/back-fr.jpg",
      spine: "https://ex/spine-fr.jpg",
    });
  });

  it("can use fallbackFrontUrl only when back and spine already exist", () => {
    expect(
      resolveBoxFaces(
        [
          { type: "image", role: "back-eu", url: "https://ex/back.jpg" },
          { type: "image", role: "spine-eu", url: "https://ex/spine.jpg" },
        ],
        { fallbackFrontUrl: "https://ex/hero.jpg" },
      ),
    ).toEqual({
      complete: true,
      front: "https://ex/hero.jpg",
      back: "https://ex/back.jpg",
      spine: "https://ex/spine.jpg",
    });

    expect(
      resolveBoxFaces(
        [{ type: "image", role: "back-eu", url: "https://ex/back.jpg" }],
        { fallbackFrontUrl: "https://ex/hero.jpg" },
      ).complete,
    ).toBe(false);
  });

  it("recognises LaunchBox Box - Spine titles", () => {
    expect(
      resolveBoxFaces([
        {
          type: "cover",
          title: "Box - Front",
          role: "eu",
          url: "https://ex/front.jpg",
          source: "launchbox",
        },
        {
          type: "image",
          title: "Box - Back",
          role: "back-eu",
          url: "https://ex/back.jpg",
          source: "launchbox",
        },
        {
          type: "image",
          title: "Box - Spine",
          role: "spine-eu",
          url: "https://ex/spine.jpg",
          source: "launchbox",
        },
      ]).complete,
    ).toBe(true);
  });

  it("prefers the shelf-platform spine over a foreign PC spine (Tomb Raider)", () => {
    // Lara Croft AoD ships on PS2 and PC — a PC spine must not dress a PS2 box.
    const faces = resolveBoxFaces(
      [
        {
          type: "cover",
          role: "fr",
          url: "https://ex/front-ps2.jpg",
          platformKey: "ps2",
        },
        {
          type: "image",
          role: "back-fr",
          url: "https://ex/back-ps2.jpg",
          platformKey: "ps2",
        },
        {
          type: "image",
          role: "spine-fr",
          title: "Box - Spine",
          url: "https://ex/spine-pc.jpg",
          platformKey: "pc",
        },
        {
          type: "image",
          role: "spine-fr",
          title: "Box - Spine",
          url: "https://ex/spine-ps2.jpg",
          platformKey: "ps2",
        },
      ],
      { preferredPlatformKey: "ps2", preferredRegion: "fr" },
    );
    expect(faces).toEqual({
      complete: true,
      front: "https://ex/front-ps2.jpg",
      back: "https://ex/back-ps2.jpg",
      spine: "https://ex/spine-ps2.jpg",
    });
  });

  it("drops a foreign-only spine rather than assembling a wrong box", () => {
    const faces = resolveBoxFaces(
      [
        {
          type: "cover",
          role: "fr",
          url: "https://ex/front-ps2.jpg",
          platformKey: "ps2",
        },
        {
          type: "image",
          role: "back-fr",
          url: "https://ex/back-ps2.jpg",
          platformKey: "ps2",
        },
        {
          type: "image",
          role: "spine-fr",
          url: "https://ex/spine-pc.jpg",
          platformKey: "pc",
        },
      ],
      { preferredPlatformKey: "ps2" },
    );
    expect(faces.complete).toBe(false);
    expect(faces).not.toHaveProperty("spine");
  });
});

describe("resolveDiscFace", () => {
  it("picks ScreenScraper / LaunchBox disc art and ignores covers", () => {
    expect(
      resolveDiscFace(
        [
          { type: "cover", role: "eu", url: "https://ex/box.jpg" },
          {
            type: "image",
            role: "disc-eu",
            url: "https://ex/disc-eu.jpg",
            source: "screenscraper",
          },
          {
            type: "image",
            title: "Disc",
            role: "disc-us",
            url: "https://ex/disc-us.jpg",
            source: "launchbox",
          },
        ],
        { preferredRegion: "eu" },
      ),
    ).toBe("https://ex/disc-eu.jpg");
  });

  it("honors preferredUrl when it matches a disc attachment", () => {
    expect(
      resolveDiscFace(
        [
          {
            type: "image",
            role: "disc-eu",
            url: "https://ex/disc-eu.jpg",
            source: "screenscraper",
          },
          {
            type: "image",
            role: "disc-us",
            url: "https://ex/disc-us.jpg",
            source: "screenscraper",
          },
        ],
        {
          preferredRegion: "eu",
          preferredUrl: "https://ex/disc-us.jpg",
        },
      ),
    ).toBe("https://ex/disc-us.jpg");
  });

  it("returns null when no disc attachment exists", () => {
    expect(
      resolveDiscFace([
        { type: "cover", role: "fr", url: "https://ex/front.jpg" },
      ]),
    ).toBeNull();
  });
});
