import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Golden-master déterministe du chemin "cache → item" de la primitive
 * code-barres. On mocke UNIQUEMENT Prisma : sur un cache-hit, `resolveBarcode`
 * ne fait aucun appel réseau externe (les couvertures viennent de
 * `prisma.metadata`), donc le test est 100% reproductible.
 *
 * Objectif : verrouiller la transformation "noms scrappés bruités → nom propre
 * + suggestions nettoyées", qui est la vraie douleur de l'app.
 */

const h = vi.hoisted(() => ({
  cache: null as unknown,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    barcodeCache: {
      findUnique: vi.fn(async () => h.cache),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({})),
    },
    // Pas de couverture en base → coverUrl null, déterministe.
    metadata: { findMany: vi.fn(async () => []) },
  },
}));

import { resolveBarcode } from "./barcodeResolver";

const CACHE_VERSION = "canonical-v23";

function makeCache(opts: {
  provider?: string;
  shelfType?: string;
  platformKey?: string | null;
  rawNames: string[];
}) {
  return {
    id: 1,
    barcode: "0000000000000",
    provider: opts.provider ?? `screenscraper-${CACHE_VERSION}`,
    platformKey: opts.platformKey ?? null,
    shelfType: opts.shelfType ?? "games",
    priceLastUpdated: null,
    priceNew: null,
    priceUsed: null,
    priceUsedCIB: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    rawNames: opts.rawNames.map((value, i) => ({
      id: i + 1,
      value,
      coverUrl: null,
      barcodeCacheId: 1,
    })),
  };
}

beforeEach(() => {
  h.cache = null;
});

describe("resolveBarcode — cache-hit (déterministe, sans réseau)", () => {
  it("nettoie le bruit de listing et conserve le suffixe plateforme (Mario Kart Wii)", async () => {
    h.cache = makeCache({
      platformKey: "wii",
      rawNames: [
        "Mario Kart Wii",
        "Mario Kart Wii - Jeu Vidéo Nintendo",
        "MARIO KART WII PAL",
      ],
    });

    const res = await resolveBarcode("0045496365226", "games");

    expect(res.platformKey).toBe("wii");
    expect(res.shelfType).toBe("games");
    // Le nom propre contient le titre + le suffixe plateforme (jeu).
    expect(res.cleanName.toLowerCase()).toContain("mario kart");
    expect(res.cleanName.toLowerCase()).toContain("wii");
    // Au moins une proposition, et un score de confiance exploitable.
    expect(res.matches.length).toBeGreaterThanOrEqual(1);
    const top = res.matches[0];
    expect(typeof top.confidence).toBe("number");
    expect(top.confidence).toBeGreaterThan(0);
    expect(top.confidence).toBeLessThanOrEqual(1);
    // Le bruit de listing ne fuit pas dans le nom affiché.
    expect(res.cleanName.toLowerCase()).not.toContain("jeu vidéo");
  });

  it("dédoublonne les variantes de casse/langue en un seul item", async () => {
    h.cache = makeCache({
      platformKey: "wii",
      rawNames: [
        "Super Mario Galaxy",
        "SUPER MARIO GALAXY",
        "super mario galaxy",
      ],
    });

    const res = await resolveBarcode("0045496363949", "games");

    expect(res.cleanName.toLowerCase()).toContain("super mario galaxy");
    // Toutes les variantes ne sont que des casses différentes du même titre.
    expect(res.matches.length).toBe(1);
  });

  it("renvoie un payload structuré et complet (forme stable)", async () => {
    h.cache = makeCache({
      platformKey: "wii",
      rawNames: ["New Super Mario Bros. Wii"],
    });

    const res = await resolveBarcode("0045496368104", "games");

    expect(res).toMatchObject({
      provider: expect.stringContaining(CACHE_VERSION),
      shelfType: "games",
      platformKey: "wii",
    });
    expect(Array.isArray(res.rawNames)).toBe(true);
    expect(Array.isArray(res.suggestions)).toBe(true);
    expect(Array.isArray(res.matches)).toBe(true);
    expect(res.cleanName.length).toBeGreaterThan(0);
  });

  it("normalise les éditions marketing (ex: Classics) vers le titre jeu", async () => {
    h.cache = makeCache({
      platformKey: "xbox",
      rawNames: ["Halo 2 Classics", "HALO 2", "Halo 2 - Jeu Video Xbox"],
    });

    const res = await resolveBarcode("0882224088060", "games");

    expect(res.platformKey).toBe("xbox");
    expect(res.cleanName.toLowerCase()).toContain("halo 2");
    expect(res.cleanName.toLowerCase()).not.toContain("classics");
    expect(res.matches).toHaveLength(1);
    expect(res.suggestions.join(" ").toLowerCase()).not.toContain("classics");
  });
});
