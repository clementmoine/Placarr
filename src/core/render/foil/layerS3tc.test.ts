import { describe, expect, it, vi } from "vitest";

import {
  fetchCatalogueFrontS3tc,
  resolveCatalogueFrontS3tc,
} from "./layerS3tc";

describe("resolveCatalogueFrontS3tc", () => {
  it("builds an absolute DXT URL beside the face", () => {
    expect(
      resolveCatalogueFrontS3tc(
        "/assets/dragonball/fw/cards/en/st01/004-p1/art.client.webp",
        {
          picture: {
            file: "layer.picture.dxt5",
            width: 512,
            height: 1024,
            format: "COMPRESSED_RGBA_S3TC_DXT5_EXT",
          },
        },
      ),
    ).toEqual({
      file: "/assets/dragonball/fw/cards/en/st01/004-p1/layer.picture.dxt5",
      width: 512,
      height: 1024,
      format: "COMPRESSED_RGBA_S3TC_DXT5_EXT",
    });
  });

  it("returns null without a picture entry", () => {
    expect(
      resolveCatalogueFrontS3tc(
        "/assets/dragonball/fw/cards/en/st01/004-p1/art.client.webp",
        { frame: { file: "layer.frame.dxt5", width: 1, height: 1, format: "x" } },
      ),
    ).toBeNull();
  });
});

describe("fetchCatalogueFrontS3tc", () => {
  it("loads meta via fetch and resolves the Front binding", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        picture: {
          file: "layer.picture.dxt5",
          width: 512,
          height: 1024,
          format: "COMPRESSED_RGBA_S3TC_DXT5_EXT",
        },
      }),
    })) as unknown as typeof fetch;
    await expect(
      fetchCatalogueFrontS3tc(
        "/assets/dragonball/fw/cards/en/fb01/044/art.client.webp",
        fetchImpl,
      ),
    ).resolves.toEqual({
      file: "/assets/dragonball/fw/cards/en/fb01/044/layer.picture.dxt5",
      width: 512,
      height: 1024,
      format: "COMPRESSED_RGBA_S3TC_DXT5_EXT",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/assets/dragonball/fw/cards/en/fb01/044/layers.s3tc.json",
    );
  });

  it("returns null on 404", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
    })) as unknown as typeof fetch;
    await expect(
      fetchCatalogueFrontS3tc(
        "/assets/dragonball/fw/cards/en/st01/020/art.client.webp",
        fetchImpl,
      ),
    ).resolves.toBeNull();
  });
});
