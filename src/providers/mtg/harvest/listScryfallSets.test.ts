import { afterEach, describe, expect, it, vi } from "vitest";

import { httpGet } from "@/lib/http/httpClient";

import { listScryfallRemoteSets } from "./listScryfallSets";

vi.mock("@/lib/http/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http/httpClient")>();
  return { ...actual, httpGet: vi.fn() };
});

afterEach(() => {
  vi.mocked(httpGet).mockReset();
});

describe("listScryfallRemoteSets", () => {
  it("keeps paper sets and drops digital / token noise", async () => {
    vi.mocked(httpGet).mockResolvedValue({
      data: {
        data: [
          { code: "mh3", name: "Modern Horizons 3", digital: false, set_type: "expansion" },
          { code: "tmh3", name: "MH3 Tokens", digital: false, set_type: "token" },
          { code: "ymh3", name: "Alchemy MH3", digital: true, set_type: "alchemy" },
        ],
      },
    } as never);

    await expect(listScryfallRemoteSets()).resolves.toEqual([
      { id: "mh3", label: "Modern Horizons 3" },
    ]);
  });

  it("returns [] on network failure", async () => {
    vi.mocked(httpGet).mockRejectedValue(new Error("offline"));
    await expect(listScryfallRemoteSets()).resolves.toEqual([]);
  });
});
