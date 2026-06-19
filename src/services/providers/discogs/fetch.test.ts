import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
import axios from "axios";

import { fetchFromDiscogs, getDiscogsAuthParams } from "./fetch";

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

  it("renvoie null quand aucun résultat", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    mockedGet.mockResolvedValue({ data: { results: [] } } as never);
    expect(await fetchFromDiscogs("0000000000000")).toBeNull();
  });

  it("renvoie null sur erreur réseau", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    mockedGet.mockRejectedValue(new Error("network"));
    expect(await fetchFromDiscogs("3614971544081")).toBeNull();
  });
});
