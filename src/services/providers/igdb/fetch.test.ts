import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    isAxiosError: (error: unknown) =>
      Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
  },
}));

import axios from "axios";
import { prisma } from "@/lib/db/prisma";
import { fetchFromIGDB, pingIGDB } from "./fetch";

const mockedAxios = vi.mocked(axios, true);
const mockedSetting = vi.mocked(prisma.setting, true);

const saved = {
  id: process.env.IGDB_CLIENT_ID,
  secret: process.env.IGDB_CLIENT_SECRET,
};

function restoreEnv() {
  if (saved.id !== undefined) process.env.IGDB_CLIENT_ID = saved.id;
  else delete process.env.IGDB_CLIENT_ID;
  if (saved.secret !== undefined) process.env.IGDB_CLIENT_SECRET = saved.secret;
  else delete process.env.IGDB_CLIENT_SECRET;
}

function configureIGDBEnv() {
  process.env.IGDB_CLIENT_ID = "client-id";
  process.env.IGDB_CLIENT_SECRET = "client-secret";
}

function setting(key: string, value: string) {
  return {
    key,
    value,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function mockCachedToken() {
  mockedSetting.findUnique.mockImplementation((async (args: any) => {
    const key = args.where.key;
    if (key === "igdb_access_token") {
      return setting(key, "stale-token");
    }
    if (key === "igdb_token_expiry") {
      return setting(key, String(Date.now() + 3_600_000));
    }
    return null;
  }) as any);
}

function unauthorizedError() {
  return {
    isAxiosError: true,
    message: "Request failed with status code 401",
    response: {
      status: 401,
      data: { message: "Authorization Failure" },
    },
  };
}

describe("fetchFromIGDB — gating credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.IGDB_CLIENT_ID;
    delete process.env.IGDB_CLIENT_SECRET;
  });

  afterEach(restoreEnv);

  it("retourne null quand les identifiants IGDB sont absents (source désactivée)", async () => {
    const res = await fetchFromIGDB("Mario Kart Wii", "wii");
    expect(res).toBeNull();
  });
});

describe("fetchFromIGDB — token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureIGDBEnv();
    mockCachedToken();
    mockedSetting.upsert.mockResolvedValue(setting("key", "value"));
    mockedSetting.deleteMany.mockResolvedValue({ count: 2 });
  });

  afterEach(restoreEnv);

  it("purge le token cache et retente une recherche metadata sur 401", async () => {
    mockedAxios.post
      .mockRejectedValueOnce(unauthorizedError())
      .mockResolvedValueOnce({
        data: { access_token: "fresh-token", expires_in: 3600 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 113112,
            name: "Hades",
            category: 0,
            cover: { id: 1, image_id: "co1" },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    const res = await fetchFromIGDB("Hades");

    expect(res?.title).toBe("Hades");
    expect(mockedSetting.deleteMany).toHaveBeenCalledWith({
      where: {
        key: { in: ["igdb_access_token", "igdb_token_expiry"] },
      },
    });
    expect(mockedSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "igdb_access_token" },
        update: { value: "fresh-token" },
      }),
    );
  });

  it("retente aussi le healthcheck IGDB avec un token frais", async () => {
    mockedAxios.post
      .mockRejectedValueOnce(unauthorizedError())
      .mockResolvedValueOnce({
        data: { access_token: "fresh-token", expires_in: 3600 },
      })
      .mockResolvedValueOnce({ data: [{ id: 1, name: "Hades" }] });

    const res = await pingIGDB();

    expect(res.ok).toBe(true);
    expect(mockedSetting.deleteMany).toHaveBeenCalledOnce();
  });
});
