import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  requireGuestOrHigher: vi.fn(),
  getMetadata: vi.fn(),
  getDatabaseSuggestions: vi.fn(),
  filterMetadataForShelfPlatform: vi.fn((_m: unknown) => _m),
  resolveGameMetadataPlatform: vi.fn(
    (platform: string | null) => platform ?? undefined,
  ),
}));

vi.mock("@/lib/auth", () => ({ requireGuestOrHigher: h.requireGuestOrHigher }));
vi.mock("@/core/enrich", () => ({
  getMetadata: h.getMetadata,
  getDatabaseSuggestions: h.getDatabaseSuggestions,
  filterMetadataForShelfPlatform: h.filterMetadataForShelfPlatform,
}));
vi.mock("@/core/enrich/platform", () => ({
  resolveGameMetadataPlatform: h.resolveGameMetadataPlatform,
}));

import { GET } from "./route";

const USER = { user: { id: "u1", role: "user" } };

function metadataReq(query: string) {
  return new NextRequest(`http://localhost/api/metadata?${query}`);
}

beforeEach(() => {
  h.requireGuestOrHigher.mockReset().mockResolvedValue(USER);
  h.getMetadata.mockReset().mockResolvedValue({ title: "Tetris" });
  h.getDatabaseSuggestions.mockReset().mockResolvedValue([]);
  h.filterMetadataForShelfPlatform.mockClear();
  h.resolveGameMetadataPlatform.mockClear();
});

describe("GET /api/metadata", () => {
  it("renvoie 401 quand non authentifié", async () => {
    h.requireGuestOrHigher.mockResolvedValue(
      NextResponse.json({ error: "x" }, { status: 401 }),
    );
    const res = await GET(metadataReq("name=Tetris&type=games"));
    expect(res.status).toBe(401);
  });

  it("400 sans name/type", async () => {
    const res = await GET(metadataReq("type=games"));
    expect(res.status).toBe(400);
  });

  it("passe crc/md5/sha1 à getMetadata comme romChecksums", async () => {
    await GET(
      metadataReq(
        "name=Completely+Unrelated&type=games&platform=Game+Boy&crc=46DF91AD&md5=aabb&sha1=ccdd",
      ),
    );
    expect(h.getMetadata).toHaveBeenCalledWith(
      "Completely Unrelated",
      "games",
      null,
      "Game Boy",
      expect.objectContaining({
        romChecksums: {
          crc: "46df91ad",
          md5: "aabb",
          sha1: "ccdd",
        },
      }),
    );
  });
});
