import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));
vi.mock("@/core/enrich/media/imageBuffer", () => ({
  looksLikeImageBuffer: () => true,
}));

import {
  flareSolverrDownloadImages,
  flareSolverrRequestGet,
} from "./flareSolverr";

const mockedPost = vi.mocked(axios.post);

describe("flareSolverrDownloadImages", () => {
  beforeEach(() => {
    mockedPost.mockReset();
    process.env.FLARESOLVERR_URL = "http://flare.test";
  });

  it("decodes base64 image payloads from FlareSolverr download responses", async () => {
    mockedPost.mockResolvedValue({
      data: {
        status: "ok",
        solution: {
          download: [
            {
              url: "https://cdn1.booknode.com/book_cover/1037/full/cover.jpg",
              mime_type: "image/jpeg",
              encoded_data: Buffer.from("jpeg-bytes").toString("base64"),
            },
          ],
        },
      },
    });

    const results = await flareSolverrDownloadImages("https://booknode.com/", [
      "https://cdn1.booknode.com/book_cover/1037/full/cover.jpg",
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.buffer.toString()).toBe("jpeg-bytes");
    expect(mockedPost).toHaveBeenCalledWith(
      "http://flare.test/v1",
      expect.objectContaining({
        download: true,
        downloadUrls: [
          "https://cdn1.booknode.com/book_cover/1037/full/cover.jpg",
        ],
      }),
      expect.any(Object),
    );
  });
});

describe("flareSolverrRequestGet", () => {
  beforeEach(() => {
    mockedPost.mockReset();
    process.env.FLARESOLVERR_URL = "http://flare.test";
  });

  it("serializes concurrent FlareSolverr requests", async () => {
    let active = 0;
    let peak = 0;
    mockedPost.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 30));
      active--;
      return {
        data: {
          status: "ok",
          solution: { status: 200, response: "<html/>" },
        },
      };
    });

    await Promise.all([
      flareSolverrRequestGet("https://example.com/a"),
      flareSolverrRequestGet("https://example.com/b"),
      flareSolverrRequestGet("https://example.com/c"),
    ]);

    expect(peak).toBe(1);
    expect(mockedPost).toHaveBeenCalledTimes(3);
  });
});
