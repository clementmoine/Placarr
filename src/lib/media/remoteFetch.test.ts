import axios from "axios";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media/coverDownloadCandidates", () => ({
  coverDownloadCandidates: () => [
    "https://cdn.example.test/small.jpg",
    "https://cdn.example.test/large.jpg",
  ],
}));
vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrCookiesFor: vi.fn().mockResolvedValue(null),
}));
vi.mock("axios", () => ({ default: { get: vi.fn() } }));

import { fetchRemoteImageBuffer } from "./remoteFetch";

const mockedGet = vi.mocked(axios.get);

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
});
