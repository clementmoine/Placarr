import fs from "fs";
import path from "path";
import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedFetch = vi.fn();
const pendingUpgrades: Array<Promise<void>> = [];

vi.mock("@/core/enrich/media/remoteFetch", () => ({
  fetchRemoteImageBuffer: (...args: unknown[]) => mockedFetch(...args),
}));

vi.mock("@/core/collect/jobs/backgroundWorkQueue", () => ({
  runCpuBackgroundWork: (fn: () => Promise<void>) => {
    pendingUpgrades.push(fn());
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    item: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    attachment: {
      update: vi.fn(),
    },
    metadata: {
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/prisma";
import { downloadBooknodeCoverImage } from "./coverDownload";

const SOURCE =
  "https://cdn1.booknode.com/book_cover/1691/full/super-picsou-geant-n1-1691432.jpg";
const PREVIEW =
  "https://cdn1.booknode.com/book_cover/1691/mod11/super-picsou-geant-n1-1691432-264-432.webp";
async function jpegBuffer(width: number, height: number) {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 20, b: 20 },
    },
  })
    .jpeg()
    .toBuffer();
}

const MEDIA_KEY = "1691:1691432";
const UPLOAD_HASH = crypto
  .createHash("md5")
  .update(`booknode:${MEDIA_KEY}`)
  .digest("hex");

describe("downloadBooknodeCoverImage", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    pendingUpgrades.length = 0;
    vi.mocked(prisma.item.findUnique).mockReset();
    vi.mocked(prisma.item.update).mockReset();
    vi.mocked(prisma.attachment.update).mockReset();
    vi.mocked(prisma.metadata.update).mockReset();

    const uploadsRoot = path.join(process.cwd(), "data", "uploads");
    for (const ext of [".webp", ".jpg", ".jpeg", ".png"]) {
      const target = path.join(uploadsRoot, `${UPLOAD_HASH}${ext}`);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  });

  it("persists the preview quickly then schedules a full upgrade", async () => {
    const preview = await jpegBuffer(264, 432);
    const full = await jpegBuffer(1200, 1800);

    mockedFetch.mockImplementation(
      async (
        url: string,
        options?: { allowSubThresholdFallback?: boolean },
      ) => {
        if (url.includes("/mod11/") && options?.allowSubThresholdFallback) {
          return {
            buffer: preview,
            contentType: "image/webp",
            sourceUrl: url,
          };
        }
        if (url.includes("/full/") && !options?.allowSubThresholdFallback) {
          return {
            buffer: full,
            contentType: "image/jpeg",
            sourceUrl: url,
          };
        }
        return null;
      },
    );

    vi.mocked(prisma.item.findUnique).mockResolvedValue({
      imageUrl: PREVIEW,
      metadata: {
        id: "meta-1",
        imageUrl: PREVIEW,
        attachments: [
          {
            id: "att-1",
            url: PREVIEW,
            source: "booknode",
          },
        ],
      },
    } as never);

    const localized = await downloadBooknodeCoverImage(SOURCE, {
      source: "booknode",
      itemId: "item-1",
      metadataId: "meta-1",
    });
    await Promise.all(pendingUpgrades);

    expect(localized).toBe(`/uploads/${UPLOAD_HASH}.webp`);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/mod11/"),
      expect.objectContaining({ allowSubThresholdFallback: true }),
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/full/"),
      expect.objectContaining({ allowSubThresholdFallback: false }),
    );
    expect(prisma.attachment.update).toHaveBeenCalledWith({
      where: { id: "att-1" },
      data: { url: `/uploads/${UPLOAD_HASH}.jpg` },
    });
  });
});
