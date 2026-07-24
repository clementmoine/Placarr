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

  it("keeps distinct search identity params (q/type) and strips UTM", () => {
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.pricecharting.com/search-products?utm_source=x&type=prices&q=Wii+U",
      ),
    ).toBe(
      "https://www.pricecharting.com/search-products?q=wii+u&type=prices",
    );
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.pricecharting.com/search-products?q=Wii%20U&type=prices",
      ),
    ).toBe(
      "https://www.pricecharting.com/search-products?q=wii+u&type=prices",
    );
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.pricecharting.com/search-products?q=borderlands&type=prices",
      ),
    ).not.toBe(
      normalizeProviderEvidenceUrl(
        "https://www.pricecharting.com/search-products?q=monkey&type=prices",
      ),
    );
  });

  it("keeps Chasse query+catalog identity (not colliding catalogs)", () => {
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.chasse-aux-livres.fr/search?query=Black+Stories&catalog=toys&utm_source=x",
      ),
    ).toBe(
      "https://www.chasse-aux-livres.fr/search?query=black+stories&catalog=toys",
    );
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.chasse-aux-livres.fr/search?query=Black%20Stories&catalog=fr",
      ),
    ).not.toBe(
      normalizeProviderEvidenceUrl(
        "https://www.chasse-aux-livres.fr/search?query=Black%20Stories&catalog=toys",
      ),
    );
  });

  it("keeps Presta/Philibert search_query and s identity", () => {
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.philibertnet.com/fr/recherche?search_query=Catan&utm_source=x",
      ),
    ).toBe(
      "https://www.philibertnet.com/fr/recherche?search_query=catan",
    );
    expect(
      normalizeProviderEvidenceUrl(
        "https://shop.example/recherche?controller=search&s=Ticket+to+Ride&ajax=1",
      ),
    ).toBe("https://shop.example/recherche?s=ticket+to+ride");
  });

  it("keeps Okkazeo ean / titre_jeu identity (drops empty + action)", () => {
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.okkazeo.com/jeux/resultats?ean=3421272109517&titre_jeu=&action=Rechercher",
      ),
    ).toBe(
      "https://www.okkazeo.com/jeux/resultats?ean=3421272109517",
    );
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.okkazeo.com/jeux/resultats?ean=&titre_jeu=Mille+Sabords&action=Rechercher",
      ),
    ).toBe(
      "https://www.okkazeo.com/jeux/resultats?titre_jeu=mille+sabords",
    );
  });

  it("keeps HDJV q+support identity (platform collisions)", () => {
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.historiquedesjeuxvideo.com/ajax_recherche_jeu.php?q=Le+Parrain+2&support=5&utm_source=x",
      ),
    ).toBe(
      "https://www.historiquedesjeuxvideo.com/ajax_recherche_jeu.php?q=le+parrain+2&support=5",
    );
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.historiquedesjeuxvideo.com/ajax_recherche_jeu.php?q=Le+Parrain+2&support=5",
      ),
    ).not.toBe(
      normalizeProviderEvidenceUrl(
        "https://www.historiquedesjeuxvideo.com/ajax_recherche_jeu.php?q=Le+Parrain+2&support=44",
      ),
    );
  });

  it("keeps Planetebd mot-clef identity", () => {
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.planetebd.com/recherche?mot-clef=Ast%C3%A9rix&utm_source=x",
      ),
    ).toBe("https://www.planetebd.com/recherche?mot-clef=ast%c3%a9rix");
  });

  it("keeps Bedetheque/Bdovore term (+ data/mode) identity", () => {
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.bedetheque.com/ajax/tout?term=Ast%C3%A9rix&utm_source=x",
      ),
    ).toBe("https://www.bedetheque.com/ajax/tout?term=ast%c3%a9rix");
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.bdovore.com/getjson?data=Serie&mode=2&term=Alpha",
      ),
    ).toBe(
      "https://www.bdovore.com/getjson?term=alpha&data=serie&mode=2",
    );
    expect(
      normalizeProviderEvidenceUrl(
        "https://www.bdovore.com/getjson?data=Serie&mode=2&term=Alpha",
      ),
    ).not.toBe(
      normalizeProviderEvidenceUrl(
        "https://www.bdovore.com/getjson?data=Album&mode=1&term=Alpha",
      ),
    );
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
