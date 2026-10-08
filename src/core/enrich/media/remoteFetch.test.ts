import axios, { type AxiosRequestConfig } from "axios";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOKNODE_FULL =
  "https://cdn1.booknode.com/book_cover/5518/full/lart-et-la-creation-de-arcane-5517968.jpg";

vi.mock("@/core/enrich/media/coverDownloadCandidates", () => ({
  coverDownloadCandidates: (url: string) => {
    if (url.includes("cdn.example.test")) {
      return [
        "https://cdn.example.test/small.jpg",
        "https://cdn.example.test/large.jpg",
      ];
    }
    if (url.includes("lddb.com")) {
      return [url];
    }
    return [
      url,
      "https://cdn1.booknode.com/book_cover/5518/mod11/lart-et-la-creation-de-arcane-5517968-264-432.webp",
    ];
  },
}));
vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrCookiesFor: vi.fn(),
  flareSolverrDownloadImages: vi.fn(),
}));
vi.mock("@/core/enrich/media/remoteProxy", () => ({
  remoteImageProxyProviderFor: (url: string) => {
    if (url.includes("booknode.com")) {
      return { id: "booknode", remoteImageFlareTimeoutMs: 20_000 };
    }
    if (url.includes("lddb.com")) {
      return { id: "lddb", remoteImageReferer: "https://www.lddb.com/" };
    }
    return null;
  },
  remoteImageRequestHeaders: (url: string) => {
    if (url.includes("booknode.com")) {
      return { Referer: "https://booknode.com/" };
    }
    if (url.includes("lddb.com")) {
      return { Referer: "https://www.lddb.com/" };
    }
    return {};
  },
}));
vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import {
  flareSolverrCookiesFor,
  flareSolverrDownloadImages,
} from "@/lib/http/flareSolverr";
import { fetchRemoteImageBuffer } from "./remoteFetch";

const mockedGet = vi.mocked(axios.get);
const mockedFlare = vi.mocked(flareSolverrCookiesFor);
const mockedFlareDownload = vi.mocked(flareSolverrDownloadImages);

async function jpegBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("fetchRemoteImageBuffer", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedFlare.mockReset();
    mockedFlareDownload.mockReset();
    mockedFlare.mockResolvedValue(null);
    mockedFlareDownload.mockResolvedValue([]);
  });

  it("prefers a larger candidate over an earlier tiny thumbnail", async () => {
    const tiny = await jpegBuffer(66, 108);
    const large = await jpegBuffer(400, 600);

    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("small")) {
        return {
          status: 200,
          data: tiny,
          headers: { "content-type": "image/jpeg" },
        };
      }
      if (url.includes("large")) {
        return {
          status: 200,
          data: large,
          headers: { "content-type": "image/jpeg" },
        };
      }
      return { status: 404, data: Buffer.alloc(0), headers: {} };
    });

    const result = await fetchRemoteImageBuffer(
      "https://cdn.example.test/small.jpg",
    );

    expect(result?.sourceUrl).toContain("large");
    expect(result?.buffer.equals(large)).toBe(true);
  });

  it("escalates to FlareSolverr when direct fetch only yields non-/full/ fallbacks", async () => {
    const tiny = await jpegBuffer(264, 432);
    const full = await jpegBuffer(1723, 2320);

    mockedGet.mockImplementation(
      async (url: string, config?: AxiosRequestConfig) => {
        const hasCookie = Boolean(config?.headers?.Cookie);
        if (url.includes("/full/") && hasCookie) {
          return {
            status: 200,
            data: full,
            headers: { "content-type": "image/jpeg" },
          };
        }
        if (url.includes("/full/")) {
          return { status: 403, data: Buffer.alloc(0), headers: {} };
        }
        if (url.includes("mod11")) {
          return {
            status: 200,
            data: tiny,
            headers: { "content-type": "image/webp" },
          };
        }
        return { status: 404, data: Buffer.alloc(0), headers: {} };
      },
    );
    mockedFlare.mockResolvedValue({
      cookie: "cf_clearance=test",
      userAgent: "flare-agent",
    });

    const result = await fetchRemoteImageBuffer(BOOKNODE_FULL);

    expect(mockedFlare).toHaveBeenCalled();
    expect(result?.sourceUrl).toContain("/full/");
    expect(result?.buffer.equals(full)).toBe(true);
  });

  it("returns null for /full/ URLs when only non-/full/ fallbacks are reachable", async () => {
    const tiny = await jpegBuffer(264, 432);

    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/full/")) {
        return { status: 403, data: Buffer.alloc(0), headers: {} };
      }
      if (url.includes("mod11")) {
        return {
          status: 200,
          data: tiny,
          headers: { "content-type": "image/webp" },
        };
      }
      return { status: 404, data: Buffer.alloc(0), headers: {} };
    });

    const result = await fetchRemoteImageBuffer(BOOKNODE_FULL);

    expect(result).toBeNull();
  });

  it("serves tiny fallbacks for /full/ URLs when display mode allows it", async () => {
    const tiny = await jpegBuffer(264, 432);

    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/full/")) {
        return { status: 403, data: Buffer.alloc(0), headers: {} };
      }
      if (url.includes("mod11")) {
        return {
          status: 200,
          data: tiny,
          headers: { "content-type": "image/webp" },
        };
      }
      return { status: 404, data: Buffer.alloc(0), headers: {} };
    });

    const result = await fetchRemoteImageBuffer(BOOKNODE_FULL, {
      allowSubThresholdFallback: true,
    });

    expect(result?.sourceUrl).toContain("mod11");
    expect(result?.buffer.equals(tiny)).toBe(true);
  });

  it("uses FlareSolverr browser download when cookies cannot fetch /full/ JPEGs", async () => {
    const tiny = await jpegBuffer(264, 432);
    const full = await jpegBuffer(1723, 2320);

    mockedGet.mockImplementation(async (url: string) => {
      if (url.includes("/full/")) {
        return { status: 403, data: Buffer.alloc(0), headers: {} };
      }
      if (url.includes("mod11")) {
        return {
          status: 200,
          data: tiny,
          headers: { "content-type": "image/webp" },
        };
      }
      return { status: 404, data: Buffer.alloc(0), headers: {} };
    });
    mockedFlare.mockResolvedValue({
      cookie: "cf_clearance=test",
      userAgent: "flare-agent",
    });
    mockedFlareDownload.mockResolvedValue([
      {
        url: BOOKNODE_FULL,
        buffer: full,
        contentType: "image/jpeg",
      },
    ]);

    const result = await fetchRemoteImageBuffer(BOOKNODE_FULL);

    expect(mockedFlareDownload).toHaveBeenCalled();
    expect(result?.sourceUrl).toBe(BOOKNODE_FULL);
    expect(result?.buffer.equals(full)).toBe(true);
  });

  it("unlocks Anubis JPEG hosts by solving the challenge on the asset URL", async () => {
    const lddbUrl =
      "https://www.lddb.com/cover/ld/33801-33900/33828.jpg";
    const jpeg = await jpegBuffer(260, 390);
    const anubisHtml = Buffer.from(
      "<!doctype html><html><title>Making sure you're not a bot!</title></html>",
    );

    mockedGet.mockImplementation(
      async (_url: string, config?: AxiosRequestConfig) => {
        const cookie = String(config?.headers?.Cookie || "");
        if (cookie.includes("asset-unlock")) {
          return {
            status: 200,
            data: jpeg,
            headers: { "content-type": "image/jpeg" },
          };
        }
        return {
          status: 200,
          data: anubisHtml,
          headers: { "content-type": "text/html" },
        };
      },
    );
    mockedFlare.mockImplementation(async (unlockUrl: string) => {
      if (unlockUrl.includes("/cover/")) {
        return {
          cookie: "asset-unlock=1",
          userAgent: "flare-agent",
        };
      }
      // Homepage cookies are too weak for LDDb covers.
      return {
        cookie: "homepage-only=1",
        userAgent: "flare-agent",
      };
    });

    const result = await fetchRemoteImageBuffer(lddbUrl, {
      allowSubThresholdFallback: true,
    });

    expect(mockedFlare).toHaveBeenCalledWith(lddbUrl, expect.any(Number));
    expect(result?.sourceUrl).toBe(lddbUrl);
    expect(result?.buffer.equals(jpeg)).toBe(true);
  });
});
