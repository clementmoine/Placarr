import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
import axios from "axios";

import { fetchFromDiscogs } from "./discogs";

const mockedGet = vi.mocked(axios.get);
const ORIGINAL_TOKEN = process.env.DISCOGS_TOKEN;

beforeEach(() => {
  mockedGet.mockReset();
});
afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.DISCOGS_TOKEN;
  else process.env.DISCOGS_TOKEN = ORIGINAL_TOKEN;
});

describe("fetchFromDiscogs", () => {
  it("est inactif (null) sans token, sans appel réseau", async () => {
    delete process.env.DISCOGS_TOKEN;
    const r = await fetchFromDiscogs("4988601467124");
    expect(r).toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
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
