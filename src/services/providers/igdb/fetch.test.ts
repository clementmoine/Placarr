import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

import { fetchFromIGDB } from "./fetch";

describe("fetchFromIGDB — gating credentials", () => {
  const saved = {
    id: process.env.IGDB_CLIENT_ID,
    secret: process.env.IGDB_CLIENT_SECRET,
  };

  beforeEach(() => {
    delete process.env.IGDB_CLIENT_ID;
    delete process.env.IGDB_CLIENT_SECRET;
  });

  afterEach(() => {
    if (saved.id !== undefined) process.env.IGDB_CLIENT_ID = saved.id;
    else delete process.env.IGDB_CLIENT_ID;
    if (saved.secret !== undefined)
      process.env.IGDB_CLIENT_SECRET = saved.secret;
    else delete process.env.IGDB_CLIENT_SECRET;
  });

  it("retourne null quand les identifiants IGDB sont absents (source désactivée)", async () => {
    const res = await fetchFromIGDB("Mario Kart Wii", "wii");
    expect(res).toBeNull();
  });
});
