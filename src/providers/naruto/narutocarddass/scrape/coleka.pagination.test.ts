/**
 * La Sync suit la pagination annoncée par Coleka (« Page 1 sur N ») — et non
 * un calcul figé à 48 par page qui réclamait des pages au-delà de la fin,
 * servies périmées par le cache CDN (2026-11-23, Sage's Legacy FR).
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetched: [] as string[] }));

const tile = (id: number, ref: string) =>
  `<article class="k5" data-id="${id}"><a class="k5-lien" href="/fr/x/c_i${id}"><div class="k5-img"><img src="https://thumbs.coleka.com/media/item/1/c${id}_250x250.webp" alt="C"></div><div class="k5-corps"><h3>Carte ${id}</h3><p>Ref. ${ref}</p></div></a></article>`;

vi.mock("@/providers/shared/coleka/listingFetch", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchColekaListingHtml: vi.fn(async (url: string) => {
    h.fetched.push(url);
    // Two announced pages of k5 tiles; anything past the end is a stale
    // cached legacy page that must never be requested.
    if (!url.includes("?p=")) {
      return `<p>Page 1 sur 2</p>${Array.from({ length: 60 }, (_, i) => tile(1000 + i, `NI-${1300 + i}`)).join("")}`;
    }
    if (url.endsWith("?p=1")) {
      return `<p>Page 2 sur 2</p>${Array.from({ length: 60 }, (_, i) => tile(2000 + i, `NI-${1360 + i}`)).join("")}`;
    }
    return `<a class="lib_has_2_lines" data-id="9" href="/fr/x/old_i9"><h3 class="product-title">Old</h3><span class="ref">Ref. NI-1</span></a>`;
  }),
}));

vi.mock("@/lib/http/httpClient", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  httpGet: vi.fn(async () => {
    throw new Error("no network in tests");
  }),
}));

import { scrapeNarutoColekaSagesLegacyCards } from "./coleka";

describe("Coleka CCG FR listing — announced pagination", () => {
  it("requests only the pages Coleka announces and reads them all", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "coleka-pages-"));
    await scrapeNarutoColekaSagesLegacyCards({
      root,
      cdxOnly: true,
      delayMs: 0,
    });
    expect(h.fetched.filter((u) => u.includes("?p=2"))).toEqual([]);
    const staged = JSON.parse(
      readFileSync(
        path.join(
          root,
          "naruto",
          "carddass",
          "staging",
          "coleka-s24",
          "cards.json",
        ),
        "utf8",
      ),
    ) as { cards: unknown[] };
    expect(staged.cards).toHaveLength(120);
  });
});
