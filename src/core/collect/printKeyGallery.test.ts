import { describe, expect, it } from "vitest";

import {
  assetsUrlBelongsToPrintGame,
  filterAttachmentsForPrintKey,
  filterMetadataForPrintKey,
  metadataForPrintKeyImagePicker,
} from "./printKeyGallery";
import {
  filterAttachmentsForPrintKey as filterAttachmentsForPrintKeyServer,
  filterMetadataForPrintKey as filterMetadataForPrintKeyServer,
} from "./printKeyGallery.server";

describe("assetsUrlBelongsToPrintGame", () => {
  it("matches nested pack lines under the game segment", () => {
    expect(
      assetsUrlBelongsToPrintGame(
        "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.jpg",
        "naruto",
      ),
    ).toBe(true);
    expect(
      assetsUrlBelongsToPrintGame(
        "/assets/naruto/kayou/cards/x/en/y/art.webp",
        "kayou",
      ),
    ).toBe(true);
    expect(
      assetsUrlBelongsToPrintGame(
        "/assets/lorcana/cards/1/en/1/art.jpg",
        "naruto",
      ),
    ).toBe(false);
    expect(assetsUrlBelongsToPrintGame("https://cdn.example/haku.jpg", "naruto")).toBe(
      null,
    );
  });
});

describe("filterAttachmentsForPrintKey (client)", () => {
  it("drops foreign /assets/ pack covers", () => {
    const kept = filterAttachmentsForPrintKey(
      [
        {
          type: "cover",
          source: "narutocarddass",
          url: "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
        },
        {
          type: "cover",
          source: "lorcanajson",
          url: "/assets/lorcana/cards/1/en/1/art.jpg",
        },
        {
          type: "cover",
          source: "user",
          url: "/uploads/mine.jpg",
        },
      ],
      "naruto:ni-0017",
    );

    expect(kept.map((a) => a.source)).toEqual(["narutocarddass", "user"]);
  });

  it("keeps remote covers (registry filter is server-only)", () => {
    const rows = [
      {
        type: "cover" as const,
        source: "lorcanajson",
        url: "https://lorcana.example/haku.jpg",
      },
    ];
    expect(filterAttachmentsForPrintKey(rows, "naruto:ni-0017")).toEqual(rows);
  });

  it("keeps everything when there is no printKey", () => {
    const rows = [
      { type: "cover", source: "lorcanajson", url: "https://x" },
    ];
    expect(filterAttachmentsForPrintKey(rows, null)).toEqual(rows);
  });
});

describe("filterAttachmentsForPrintKey (server registry)", () => {
  it("drops covers from providers that claim another print game", () => {
    const kept = filterAttachmentsForPrintKeyServer(
      [
        {
          type: "cover",
          source: "narutocarddass",
          url: "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
        },
        {
          type: "cover",
          source: "lorcanajson",
          url: "https://lorcana.example/haku.jpg",
        },
        {
          type: "cover",
          source: "user",
          url: "/uploads/mine.jpg",
        },
      ],
      "naruto:ni-0017",
    );

    expect(kept.map((a) => a.source)).toEqual(["narutocarddass", "user"]);
  });
});

describe("filterMetadataForPrintKey", () => {
  it("clears a foreign imageUrl that only existed as a Lorcana /assets/ attachment", () => {
    const filtered = filterMetadataForPrintKey(
      {
        title: "Haku",
        imageUrl: "/assets/lorcana/cards/1/en/1/art.jpg",
        attachments: [
          {
            type: "cover",
            source: "lorcanajson",
            url: "/assets/lorcana/cards/1/en/1/art.jpg",
          },
          {
            type: "cover",
            source: "narutocarddass",
            url: "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
          },
        ],
      },
      "naruto:ni-0017",
    );

    expect(filtered?.attachments?.map((a) => a.source)).toEqual([
      "narutocarddass",
    ]);
    expect(filtered?.imageUrl).toBe(
      "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
    );
  });

  it("server filter clears remote Lorcana imageUrl by provider printGames", () => {
    const filtered = filterMetadataForPrintKeyServer(
      {
        title: "Haku",
        imageUrl: "https://lorcana.example/hakuna.jpg",
        attachments: [
          {
            type: "cover",
            source: "lorcanajson",
            url: "https://lorcana.example/hakuna.jpg",
          },
          {
            type: "cover",
            source: "narutocarddass",
            url: "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
          },
        ],
      },
      "naruto:ni-0017",
    );

    expect(filtered?.attachments?.map((a) => a.source)).toEqual([
      "narutocarddass",
    ]);
    expect(filtered?.imageUrl).toBe(
      "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
    );
  });
});

describe("metadataForPrintKeyImagePicker", () => {
  it("merges printKey-scoped preview faces onto a single stored winner", () => {
    const merged = metadataForPrintKeyImagePicker(
      {
        title: "Haku",
        imageUrl:
          "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
        attachments: [
          {
            type: "cover",
            source: "narutocarddass",
            url: "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
          },
        ],
      },
      {
        title: "Haku",
        imageUrl:
          "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
        attachments: [
          {
            type: "cover",
            source: "narutocarddass",
            role: "naruto-face-carddass",
            url: "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
          },
          {
            type: "cover",
            source: "narutocarddass",
            role: "naruto-face-coleka",
            url: "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.coleka.webp",
          },
          {
            type: "cover",
            source: "lorcanajson",
            url: "/assets/lorcana/cards/1/en/1/noise.jpg",
          },
        ],
      },
      "naruto:ni-0017",
    );

    expect(merged?.attachments?.map((a) => a.url)).toEqual([
      "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.carddass.jpg",
      "/assets/naruto/carddass/cards/ninja/ni0017/fr/art.coleka.webp",
    ]);
  });
});
