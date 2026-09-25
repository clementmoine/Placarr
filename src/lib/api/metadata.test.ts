import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));

vi.mock("axios", () => ({
  default: { get: h.get },
  isAxiosError: h.isAxiosError,
}));

import { getMetadataPreview } from "./metadata";

describe("getMetadataPreview", () => {
  beforeEach(() => {
    h.get.mockReset().mockResolvedValue({ data: { title: "Tetris" } });
  });

  it("includes crc/md5/sha1 query params when romChecksums are set", async () => {
    await getMetadataPreview(
      "Completely Unrelated",
      "games",
      null,
      "gb",
      null,
      {
        crc: "46df91ad",
        md5: "aabb",
        sha1: "ccdd",
      },
    );
    expect(h.get).toHaveBeenCalledWith(
      "/api/metadata",
      expect.objectContaining({
        params: expect.objectContaining({
          name: "Completely Unrelated",
          type: "games",
          platform: "gb",
          crc: "46df91ad",
          md5: "aabb",
          sha1: "ccdd",
        }),
      }),
    );
  });

  it("includes printKey when provided", async () => {
    await getMetadataPreview(
      "Haku",
      "tcg",
      null,
      null,
      "Naruto",
      null,
      "naruto:ni-0017",
    );
    expect(h.get).toHaveBeenCalledWith(
      "/api/metadata",
      expect.objectContaining({
        params: expect.objectContaining({
          name: "Haku",
          type: "tcg",
          shelfName: "Naruto",
          printKey: "naruto:ni-0017",
        }),
      }),
    );
  });
});
