import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readShopifySearchEvidence = vi.fn();
const promoteShopifySearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readShopifySearchEvidence: (...args: unknown[]) =>
    readShopifySearchEvidence(...args),
  promoteShopifySearchEvidence: (...args: unknown[]) =>
    promoteShopifySearchEvidence(...args),
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

import {
  extractProductHandles,
  fetchShopifySearchHandles,
  stripHtml,
} from "./fetch";
import { LATELIERDESJEUX_CONFIG } from "./configs";

const mockedGet = vi.mocked(axios.get);

const SEARCH_HTML = `
  <header><a href="/products/carte-cadeaux">Carte cadeau</a></header>
  <main>
    <a href="/products/mille-sabords-3421272109517"><img/></a>
    <a href="/products/mille-sabords-3421272109517">Mille Sabords</a>
  </main>`;

describe("extractProductHandles", () => {
  it("renvoie tous les handles dédupliqués dans l'ordre (résultat ≠ premier lien)", () => {
    expect(extractProductHandles(SEARCH_HTML)).toEqual([
      "carte-cadeaux",
      "mille-sabords-3421272109517",
    ]);
  });

  it("renvoie une liste vide sans lien produit", () => {
    expect(extractProductHandles("<div>aucun produit</div>")).toEqual([]);
  });
});

describe("stripHtml", () => {
  it("retire les balises et décode les entités courantes", () => {
    expect(stripHtml("<p>Jeu&nbsp;de <b>dés</b> &amp; pirates</p>")).toBe(
      "Jeu de dés & pirates",
    );
    expect(stripHtml(null)).toBeUndefined();
    expect(stripHtml("   ")).toBeUndefined();
  });
});

describe("fetchShopifySearchHandles", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readShopifySearchEvidence.mockReset();
    promoteShopifySearchEvidence.mockReset();
    readShopifySearchEvidence.mockResolvedValue(null);
    promoteShopifySearchEvidence.mockResolvedValue(undefined);
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    readShopifySearchEvidence.mockResolvedValueOnce([
      "mille-sabords-3421272109517",
      "carte-cadeaux",
    ]);

    await expect(
      fetchShopifySearchHandles(
        LATELIERDESJEUX_CONFIG,
        "",
        "3421272109517",
      ),
    ).resolves.toEqual([
      "mille-sabords-3421272109517",
      "carte-cadeaux",
    ]);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteShopifySearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: SEARCH_HTML,
    } as never);

    const handles = await fetchShopifySearchHandles(
      LATELIERDESJEUX_CONFIG,
      "",
      "3421272109517",
    );
    expect(handles[0]).toBe("mille-sabords-3421272109517");
    expect(promoteShopifySearchEvidence).toHaveBeenCalledWith(
      "latelierdesjeux",
      expect.stringContaining("/search?q=3421272109517"),
      expect.arrayContaining(["mille-sabords-3421272109517"]),
    );
  });
});
