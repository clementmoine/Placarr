import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  authReturn: { user: { id: "u1", role: "user" } } as unknown,
  fetchRemoteImageBuffer: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireGuestOrHigher: vi.fn(async () => h.authReturn),
}));
vi.mock("@/core/media/remoteFetch", () => ({
  fetchRemoteImageBuffer: h.fetchRemoteImageBuffer,
}));

import { GET } from "./route";

const BOOKNODE_URL =
  "https://cdn1.booknode.com/book_cover/5518/full/lart-et-la-creation-de-arcane-5517967.jpg";

describe("GET /api/media/remote", () => {
  beforeEach(() => {
    h.authReturn = { user: { id: "u1", role: "user" } } as unknown;
    h.fetchRemoteImageBuffer.mockReset();
  });

  it("returns image bytes for an allowed protected CDN URL", async () => {
    h.fetchRemoteImageBuffer.mockResolvedValue({
      buffer: Buffer.from("fake-image"),
      contentType: "image/jpeg",
      sourceUrl: BOOKNODE_URL,
    });

    const res = await GET(
      new NextRequest(
        `http://localhost/api/media/remote?url=${encodeURIComponent(BOOKNODE_URL)}`,
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(h.fetchRemoteImageBuffer).toHaveBeenCalledWith(BOOKNODE_URL, {
      allowSubThresholdFallback: true,
    });
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
