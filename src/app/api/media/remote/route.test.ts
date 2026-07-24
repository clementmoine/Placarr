import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { id: "u1", role: "user" } } as unknown,
  fetchRemoteImageBuffer: vi.fn(),
  findCachedRemoteImageUpload: vi.fn(),
  persistRemoteImageUpload: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: vi.fn(async () => h.authReturn),
}));
vi.mock("@/core/enrich/media/remoteFetch", () => ({
  fetchRemoteImageBuffer: h.fetchRemoteImageBuffer,
}));
vi.mock("@/core/enrich/media/remoteImageDiskCache", () => ({
  findCachedRemoteImageUpload: h.findCachedRemoteImageUpload,
  persistRemoteImageUpload: h.persistRemoteImageUpload,
}));
vi.mock("@/core/catalog/mediaProxy", () => ({
  screenScraperMediaFetchUrl: (url: string) => url,
  resolveScreenScraperCoverFallback: vi.fn(async () => null),
}));

import { GET } from "./route";

const BOOKNODE_URL =
  "https://cdn1.booknode.com/book_cover/5518/full/lart-et-la-creation-de-arcane-5517967.jpg";

describe("GET /api/media/remote", () => {
  beforeEach(() => {
    h.authReturn = { user: { id: "u1", role: "user" } } as unknown;
    h.fetchRemoteImageBuffer.mockReset();
    h.findCachedRemoteImageUpload.mockReset();
    h.persistRemoteImageUpload.mockReset();
    h.findCachedRemoteImageUpload.mockReturnValue(null);
  });

  it("serves a disk cache hit without upstream fetch", async () => {
    h.findCachedRemoteImageUpload.mockReturnValue({
      absolutePath: "/tmp/x.jpg",
      publicPath: "/uploads/abc.jpg",
      contentType: "image/jpeg",
      buffer: Buffer.from("cached-image"),
    });

    const res = await GET(
      new NextRequest(
        `http://localhost/api/media/remote?url=${encodeURIComponent(BOOKNODE_URL)}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Placarr-Image-Cache")).toBe("HIT");
    expect(h.fetchRemoteImageBuffer).not.toHaveBeenCalled();
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe(
      "cached-image",
    );
  });

  it("fetches, persists, and returns image bytes on cache miss", async () => {
    h.fetchRemoteImageBuffer.mockResolvedValue({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      sourceUrl: BOOKNODE_URL,
    });
    h.persistRemoteImageUpload.mockReturnValue({
      absolutePath: "/tmp/y.jpg",
      publicPath: "/uploads/y.jpg",
      contentType: "image/jpeg",
      buffer: Buffer.from("fake-image"),
    });

    const res = await GET(
      new NextRequest(
        `http://localhost/api/media/remote?url=${encodeURIComponent(BOOKNODE_URL)}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("X-Placarr-Image-Cache")).toBe("MISS");
    expect(h.fetchRemoteImageBuffer).toHaveBeenCalledWith(BOOKNODE_URL, {
      allowSubThresholdFallback: true,
    });
    expect(h.persistRemoteImageUpload).toHaveBeenCalledWith(
      BOOKNODE_URL,
      Buffer.from("fake-image"),
      expect.objectContaining({
        contentType: "image/jpeg",
        sourceUrl: BOOKNODE_URL,
      }),
    );
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("fake-image");
  });

  it("rejects URLs outside the protected-provider allowlist", async () => {
    const res = await GET(
      new NextRequest(
        "http://localhost/api/media/remote?url=https://evil.example/x.jpg",
      ),
    );

    expect(res.status).toBe(400);
    expect(h.fetchRemoteImageBuffer).not.toHaveBeenCalled();
  });

  it("returns 404 when upstream fetch fails", async () => {
    h.fetchRemoteImageBuffer.mockResolvedValue(null);

    const res = await GET(
      new NextRequest(
        `http://localhost/api/media/remote?url=${encodeURIComponent(BOOKNODE_URL)}`,
      ),
    );

    expect(res.status).toBe(404);
    expect(h.persistRemoteImageUpload).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const { requireGuestOrHigher } = await import("@/lib/auth");
    vi.mocked(requireGuestOrHigher).mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );

    const res = await GET(
      new NextRequest(
        `http://localhost/api/media/remote?url=${encodeURIComponent(BOOKNODE_URL)}`,
      ),
    );

    expect(res.status).toBe(401);
  });
});
