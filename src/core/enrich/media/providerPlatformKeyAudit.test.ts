import { describe, expect, it } from "vitest";

import { buildLaunchBoxAttachments } from "@/providers/launchbox/images";
import { mapSensCritiqueMetadata } from "@/providers/senscritique/resolver";
import { withMetadataPlatformKeys } from "@/core/enrich/media/platformKeyStamp";
import { PROVIDERS } from "@/core/catalog/catalog";

/** Game providers with `isRealBoxCover` that stamp platformKey in their resolver. */
const REAL_BOX_GAME_COVER_STAMPED = [
  "chipweld",
  "chocobonplan",
  "coverproject",
  "geedie",
  "hdjv",
  "icollect",
  "launchbox",
  "netgamesretro",
  "pricecharting",
  "screenscraper",
  "senscritique",
  "thegamesdb",
] as const;

/** Listing photos without a platform URL signal — shelf fallback at storage/read time. */
const REAL_BOX_GAME_COVER_STORAGE_FALLBACK = ["freakxy"] as const;

/** Generic Wikidata entity image — no console signal; storage/read shelf fallback only. */
const CANONICAL_GAME_COVER_SHELF_FALLBACK = ["wikidata"] as const;

/** Canonical game cover galleries (community / multi-platform catalogs). */
const CANONICAL_GAME_COVER_STAMPED = [
  "igdb",
  "rawg",
  "steam",
  "steamgriddb",
] as const;

describe("provider platformKey stamping", () => {
  it("stamps LaunchBox attachments from metadata.platformKey", () => {
    const attachments = buildLaunchBoxAttachments([
      {
        fileName: "Images/Box/Front/NA.jpg",
        type: "Box - Front",
        region: "North America",
      },
    ]);

    const metadata = withMetadataPlatformKeys(
      {
        title: "Game",
        platformKey: "psvita",
        attachments,
      },
      "psvita",
    );

    expect(metadata.attachments?.[0]?.platformKey).toBe("psvita");
  });

  it("keeps ScreenScraper-style explicit attachment keys when already set", () => {
    const metadata = withMetadataPlatformKeys(
      {
        title: "Game",
        platformKey: "psvita",
        attachments: [
          {
            type: "cover",
            url: "https://example.com/3d.jpg",
            source: "screenscraper",
            role: "3d-us",
            platformKey: "psvita",
          },
          {
            type: "cover",
            url: "https://example.com/2d.jpg",
            source: "screenscraper",
            role: "us",
          },
        ],
      },
      "psvita",
    );

    expect(metadata.attachments?.map((attachment) => attachment.platformKey)).toEqual(
      ["psvita", "psvita"],
    );
  });

  it("stamps SensCritique covers from shelf context", () => {
    const metadata = mapSensCritiqueMetadata(
      {
        id: 1,
        title: "Pokémon Jaune",
        coverUrl: "https://media.senscritique.com/cover.jpg",
        productUrl: "https://www.senscritique.com/jeuvideo/pokemon_jaune/1",
      },
      { shelfName: "Nintendo Gameboy" },
    );

    expect(metadata.platformKey).toBe("gb");
    expect(metadata.attachments?.[0]?.platformKey).toBe("gb");
  });

  it("covers every game provider that declares isRealBoxCover", () => {
    const realBoxGameProviderIds = PROVIDERS.filter(
      (provider) =>
        provider.types.includes("games") && provider.isRealBoxCover === true,
    )
      .map((provider) => provider.id)
      .sort();

    expect(realBoxGameProviderIds).toEqual(
      [
        ...REAL_BOX_GAME_COVER_STAMPED,
        ...REAL_BOX_GAME_COVER_STORAGE_FALLBACK,
      ].sort(),
    );
  });

  it("covers every canonical game provider that emits cover attachments", () => {
    const canonicalGameCoverIds = PROVIDERS.filter(
      (provider) =>
        provider.types.includes("games") &&
        provider.canonical === true &&
        provider.capabilities.includes("cover"),
    )
      .map((provider) => provider.id)
      .sort();

    expect(canonicalGameCoverIds).toEqual(
      [
        ...CANONICAL_GAME_COVER_STAMPED,
        ...CANONICAL_GAME_COVER_SHELF_FALLBACK,
        ...REAL_BOX_GAME_COVER_STAMPED.filter((id) =>
          ["coverproject", "launchbox", "screenscraper", "thegamesdb"].includes(
            id,
          ),
        ),
      ].sort(),
    );
  });
});
