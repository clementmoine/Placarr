import { afterEach, describe, expect, it } from "vitest";

import {
  pickKayouTierBacks,
  listKayouPerCardBackRows,
  type KayouOfficialCardBack,
} from "./kayouOfficialBacks";
import {
  __setKayouOfficialCardBackManifestForTests,
  buildKayouOfficialCardBackManifest,
  kayouCardBackUrlForOfficialReference,
  resetKayouOfficialCardBackManifestCache,
} from "./kayouOfficialCardBacks";

afterEach(() => {
  resetKayouOfficialCardBackManifestCache();
});

describe("pickKayouTierBacks", () => {
  it("groups by tier and picks majority URL on conflict", () => {
    const rows: KayouOfficialCardBack[] = [
      {
        idCode: "a",
        rarity: "UR",
        backImage: "https://cdn/ur-a.png",
        seriesId: "series-1",
      },
      {
        idCode: "b",
        rarity: "UR",
        backImage: "https://cdn/ur-a.png",
        seriesId: "series-1",
      },
      {
        idCode: "c",
        rarity: "UR",
        backImage: "https://cdn/ur-b.png",
        seriesId: "series-2",
      },
      {
        idCode: "d",
        rarity: "SSR",
        backImage: "https://cdn/ssr.png",
        seriesId: "series-1",
      },
    ];
    const picks = pickKayouTierBacks(rows);
    expect(picks).toEqual([
      {
        tier: "ssr",
        url: "https://cdn/ssr.png",
        votes: 1,
        seriesIds: ["series-1"],
        conflict: false,
      },
      {
        tier: "ur",
        url: "https://cdn/ur-a.png",
        votes: 2,
        seriesIds: ["series-1"],
        conflict: true,
      },
    ]);
  });
});

describe("listKayouPerCardBackRows", () => {
  it("flags series tiers with multiple distinct backs", () => {
    const rows: KayouOfficialCardBack[] = [
      {
        idCode: "NREA02-UR-001L3",
        rarity: "UR",
        backImage: "https://cdn/a.png",
        seriesId: "series-8idoe481",
      },
      {
        idCode: "NREA02-UR-015L3",
        rarity: "UR",
        backImage: "https://cdn/b.png",
        seriesId: "series-8idoe481",
      },
      {
        idCode: "NREA02-R-001L1",
        rarity: "R",
        backImage: "https://cdn/r.png",
        seriesId: "series-8idoe481",
      },
      {
        idCode: "NREA02-R-002L1",
        rarity: "R",
        backImage: "https://cdn/r.png",
        seriesId: "series-8idoe481",
      },
    ];
    const perCard = listKayouPerCardBackRows(rows);
    expect(perCard.map((r) => r.idCode).sort()).toEqual([
      "NREA02-UR-001L3",
      "NREA02-UR-015L3",
    ]);
  });
});

describe("kayouOfficialCardBackManifest", () => {
  it("resolves print placement to card-local back.webp", () => {
    __setKayouOfficialCardBackManifestForTests(
      buildKayouOfficialCardBackManifest(
        [
          {
            idCode: "NREA02-UR-015L3",
            url: "https://cdn/b.png",
            seriesId: "series-8idoe481",
            rarity: "UR",
            placement: {
              kind: "print",
              set: "nrea02",
              lang: "en",
              card: "nrea02.ur.015l3",
            },
          },
        ],
        { observed: "2026-08-28", seriesIds: ["series-8idoe481"] },
      ),
    );
    expect(
      kayouCardBackUrlForOfficialReference("NREA02-UR-015L3", "UR"),
    ).toBe(
      "/assets/naruto/kayou/cards/nrea02/en/nrea02.ur.015l3/back.webp",
    );
    expect(kayouCardBackUrlForOfficialReference("NR-UR-015L3", "UR")).toBe(
      "/assets/naruto/kayou/cards/nrea02/en/nrea02.ur.015l3/back.webp",
    );
  });

  it("resolves tier placement to pack back.<tier>.webp", () => {
    __setKayouOfficialCardBackManifestForTests(
      buildKayouOfficialCardBackManifest(
        [
          {
            idCode: "NREA02-UR-001L3",
            url: "https://cdn/a.png",
            seriesId: "series-8idoe481",
            rarity: "UR",
            placement: { kind: "tier", slug: "ur" },
          },
        ],
        { observed: "2026-08-28", seriesIds: ["series-8idoe481"] },
      ),
    );
    expect(
      kayouCardBackUrlForOfficialReference("NREA02-UR-001L3", "UR"),
    ).toBe("/assets/naruto/kayou/cards/back.ur.webp");
  });
});
