import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
import axios from "axios";

import {
  cleanDiscogsNotes,
  fetchFromDiscogs,
  getDiscogsAuthParams,
  isDiscogsCompilationBundle,
  pickBestDiscogsBarcodeSearchResult,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);
const AUTH_VARS = [
  "DISCOGS_TOKEN",
  "DISCOGS_CONSUMER_KEY",
  "DISCOGS_CONSUMER_SECRET",
] as const;
const ORIGINAL = Object.fromEntries(AUTH_VARS.map((k) => [k, process.env[k]]));

function clearAuth() {
  for (const k of AUTH_VARS) delete process.env[k];
}

beforeEach(() => {
  mockedGet.mockReset();
  clearAuth();
});
afterEach(() => {
  clearAuth();
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v !== undefined) process.env[k] = v;
  }
});

describe("getDiscogsAuthParams", () => {
  it("priorise le token personnel", () => {
    process.env.DISCOGS_TOKEN = "token";
    process.env.DISCOGS_CONSUMER_KEY = "key";
    process.env.DISCOGS_CONSUMER_SECRET = "secret";
    expect(getDiscogsAuthParams()).toEqual({ token: "token" });
  });

  it("accepte consumer key + secret", () => {
    process.env.DISCOGS_CONSUMER_KEY = "key";
    process.env.DISCOGS_CONSUMER_SECRET = "secret";
    expect(getDiscogsAuthParams()).toEqual({ key: "key", secret: "secret" });
  });

  it("renvoie null sans auth", () => {
    expect(getDiscogsAuthParams()).toBeNull();
  });
});

describe("cleanDiscogsNotes", () => {
  it("retire le markup Discogs en gardant le texte lisible", () => {
    const raw =
      "Composed by [a=Yoko Shimomura].\n" +
      "Published by [l=Square Enix Music].\n" +
      "See [url=https://example.com]the site[/url]. [b]Limited[/b] edition [a123].";
    expect(cleanDiscogsNotes(raw)).toBe(
      "Composed by Yoko Shimomura.\n" +
        "Published by Square Enix Music.\n" +
        "See the site. Limited edition.",
    );
  });
});

const MAROON_FIVE_DISCOGS_HITS = [
  {
    id: 9140437,
    country: "Indonesia",
    title: "Maroon 5 - It Won't Be Soon Before Long",
    year: 2008,
    format: ["CD", "Album", "Deluxe Edition"],
  },
  {
    id: 8646306,
    country: "UK",
    title: "Maroon 5 - It Won't Be Soon Before Long",
    year: 2008,
    format: ["CD", "Album", "Deluxe Edition"],
  },
  {
    id: 2497671,
    country: "Europe",
    title: "Maroon 5 - It Won't Be Soon Before Long",
    year: 2008,
    format: ["CD", "Album", "Special Edition"],
  },
  {
    id: 15751696,
    country: "Europe",
    title: "Maroon 5 - Songs About Jane / It Won't Be Soon Before Long",
    year: 2011,
    format: ["CD", "Album", "All Media", "Compilation"],
  },
];

describe("pickBestDiscogsBarcodeSearchResult", () => {
  it("prefers a locale-relevant regional pressing over distant duplicates", () => {
    expect(
      pickBestDiscogsBarcodeSearchResult(MAROON_FIVE_DISCOGS_HITS)?.id,
    ).toBe(2497671);
  });

  it("ignores multi-album compilation bundles on the same barcode", () => {
    expect(
      isDiscogsCompilationBundle({
        title: "Maroon 5 - Songs About Jane / It Won't Be Soon Before Long",
        format: ["CD", "Album", "All Media", "Compilation"],
      }),
    ).toBe(true);
  });
});

describe("fetchFromDiscogs", () => {
  it("est inactif (null) sans auth, sans appel réseau", async () => {
    const r = await fetchFromDiscogs("4988601467124");
    expect(r).toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("s'active avec consumer key + secret", async () => {
    process.env.DISCOGS_CONSUMER_KEY = "k";
    process.env.DISCOGS_CONSUMER_SECRET = "s";
    mockedGet.mockResolvedValue({
      data: { results: [{ title: "Air - Moon Safari", year: 1998 }] },
    } as never);
    const r = await fetchFromDiscogs("3614971544081");
    expect(r?.title).toBe("Air - Moon Safari");
  });

  it("résout un code-barres avec token", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    mockedGet.mockResolvedValue({
      data: {
        results: [
          { title: "Daft Punk - Discovery", year: 2001 },
          { title: "Other", year: 2010 },
        ],
      },
    } as never);

    const r = await fetchFromDiscogs("3614971544081");
    expect(r?.title).toBe("Daft Punk - Discovery");
    expect(r?.year).toBe("2001");
  });

  it("récupère les images du détail release", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    mockedGet
      .mockResolvedValueOnce({
        data: {
          results: [
            {
              id: 14232304,
              title: "Yoko Shimomura - Kingdom Hearts Orchestra",
              year: 2019,
              cover_image: "https://i.discogs.com/search-cover.jpeg",
            },
          ],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          images: [
            {
              type: "primary",
              uri: "https://i.discogs.com/primary.jpeg",
              width: 600,
              height: 546,
            },
            {
              type: "secondary",
              uri: "https://i.discogs.com/back.jpeg",
              width: 600,
              height: 537,
            },
          ],
        },
      } as never);

    const r = await fetchFromDiscogs("4988601467124");
    expect(r?.imageUrl).toBe("https://i.discogs.com/primary.jpeg");
    expect(r?.images).toEqual([
      {
        url: "https://i.discogs.com/primary.jpeg",
        kind: "primary",
        width: 600,
        height: 546,
      },
      {
        url: "https://i.discogs.com/back.jpeg",
        kind: "secondary",
        width: 600,
        height: 537,
      },
    ]);
  });

  it("extrait les artistes du détail release et nettoie le suffixe (n)", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    mockedGet
      .mockResolvedValueOnce({
        data: {
          results: [{ id: 42, title: "Nirvana - Nevermind", year: 1991 }],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          artists: [
            { name: "Nirvana (2)" },
            { name: "Various" },
            { name: "Butch Vig" },
          ],
          labels: [
            { name: "DGC (2)" },
            { name: "Not On Label" },
            { name: "Sub Pop" },
          ],
        },
      } as never);

    const r = await fetchFromDiscogs("0720642442524");
    // "(2)" disambiguation stripped, "Various" dropped.
    expect(r?.artists).toEqual(["Nirvana", "Butch Vig"]);
    // labels → publishers source, "(2)" stripped, "Not On Label" dropped.
    expect(r?.labels).toEqual(["DGC", "Sub Pop"]);
  });

  it("renvoie null quand aucun résultat", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    mockedGet.mockResolvedValue({ data: { results: [] } } as never);
    expect(await fetchFromDiscogs("0000000000000")).toBeNull();
  });

  it("choisit la pressing régionale la plus pertinente pour un barcode ambigu", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    mockedGet
      .mockResolvedValueOnce({
        data: { results: MAROON_FIVE_DISCOGS_HITS },
      } as never)
      .mockResolvedValueOnce({
        data: {
          country: "Europe",
          labels: [{ name: "A&M Octone Records", catno: "0602517767669" }],
          formats: [
            {
              name: "CD",
              descriptions: ["Album", "Special Edition"],
              qty: 1,
            },
          ],
          images: [
            {
              type: "primary",
              uri: "https://i.discogs.com/europe-primary.jpeg",
            },
          ],
        },
      } as never);

    const r = await fetchFromDiscogs("602517767669");
    expect(r?.id).toBe(2497671);
    expect(r?.country).toBe("Europe");
    expect(r?.catalogNumber).toBe("0602517767669");
    expect(r?.edition).toBe("Special Edition");
  });

  it("renvoie null sur erreur réseau", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    mockedGet.mockRejectedValue(new Error("network"));
    expect(await fetchFromDiscogs("3614971544081")).toBeNull();
  });
});
