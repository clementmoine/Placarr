import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerEvidence: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

import {
  getFreshProviderEvidence,
  normalizeProviderEvidenceUrl,
  providerEvidenceIsFresh,
  PROVIDER_EVIDENCE_DETAIL_KIND,
  PROVIDER_EVIDENCE_DETAIL_TTL_MS,
  putProviderEvidence,
} from "./providerEvidenceStore";

describe("normalizeProviderEvidenceUrl", () => {
  it("strips query/hash and lowercases a fiche URL", () => {
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.PriceCharting.com/game/Wii/Super-Monkey-Ball/?utm=1#gallery",
      ),
    ).toBe("https://www.pricecharting.com/game/wii/super-monkey-ball");
  });

  it("returns null for empty or invalid URLs", () => {
    expect(normalizeProviderEvidenceUrl("")).toBeNull();
    expect(normalizeProviderEvidenceUrl("not-a-url")).toBeNull();
  });
});

describe("providerEvidenceIsFresh", () => {
  it("is true before expiresAt and false after", () => {
    const expiresAt = new Date("2026-07-24T12:00:00.000Z");
    expect(
      providerEvidenceIsFresh(expiresAt, Date.parse("2026-07-24T11:59:00.000Z")),
    ).toBe(true);
    expect(
      providerEvidenceIsFresh(expiresAt, Date.parse("2026-07-24T12:00:00.000Z")),
    ).toBe(false);
  });
});

describe("getFreshProviderEvidence / putProviderEvidence", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
  });

  it("returns null when no row or expired", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(
      await getFreshProviderEvidence(
        "pricecharting",
        "https://www.pricecharting.com/game/wii/super-monkey-ball",
      ),
    ).toBeNull();

    findUnique.mockResolvedValueOnce({
      providerId: "pricecharting",
      url: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      kind: PROVIDER_EVIDENCE_DETAIL_KIND,
      yieldJson: { priceUsed: 1000 },
      fetchedAt: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-07-01T01:00:00.000Z"),
    });
    expect(
      await getFreshProviderEvidence(
        "pricecharting",
        "https://www.pricecharting.com/game/wii/super-monkey-ball",
        new Date("2026-07-24T00:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("returns a fresh row", async () => {
    const expiresAt = new Date(Date.now() + PROVIDER_EVIDENCE_DETAIL_TTL_MS);
    findUnique.mockResolvedValueOnce({
      providerId: "pricecharting",
      url: "https://www.pricecharting.com/game/wii/super-monkey-ball",
      kind: PROVIDER_EVIDENCE_DETAIL_KIND,
      yieldJson: { priceUsed: 4200, productName: "Super Monkey Ball" },
      fetchedAt: new Date(),
      expiresAt,
    });

    const row = await getFreshProviderEvidence(
      "pricecharting",
      "https://www.pricecharting.com/game/wii/super-monkey-ball?x=1",
    );
    expect(row?.yieldJson).toEqual({
      priceUsed: 4200,
      productName: "Super Monkey Ball",
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        providerId_url: {
          providerId: "pricecharting",
          url: "https://www.pricecharting.com/game/wii/super-monkey-ball",
        },
      },
    });
  });

  it("upserts normalized URL with TTL", async () => {
    upsert.mockResolvedValueOnce({});
    const fetchedAt = new Date("2026-07-24T10:00:00.000Z");
    await putProviderEvidence({
      providerId: "pricecharting",
      url: "https://www.pricecharting.com/game/wii/super-monkey-ball/#x",
      kind: PROVIDER_EVIDENCE_DETAIL_KIND,
      yieldJson: { priceUsed: 1000 },
      fetchedAt,
      ttlMs: 60_000,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          providerId_url: {
            providerId: "pricecharting",
            url: "https://www.pricecharting.com/game/wii/super-monkey-ball",
          },
        },
        create: expect.objectContaining({
          expiresAt: new Date("2026-07-24T10:01:00.000Z"),
          yieldJson: { priceUsed: 1000 },
        }),
      }),
    );
  });
});
