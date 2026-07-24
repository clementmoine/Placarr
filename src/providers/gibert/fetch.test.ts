import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readGibertSearchEvidence = vi.fn();
const promoteGibertSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readGibertSearchEvidence: (...args: unknown[]) =>
    readGibertSearchEvidence(...args),
  promoteGibertSearchEvidence: (...args: unknown[]) =>
    promoteGibertSearchEvidence(...args),
}));

vi.mock("@/lib/http/flareSolverr", () => ({
  flareSolverrRequestGet: vi.fn().mockResolvedValue(null),
}));

import {
  gibertSearchUrl,
  parseGibertProductPage,
  parseGibertSearchHits,
  searchGibertHits,
} from "./fetch";
import { mapGibertMetadata } from "./index";

const mockedGet = vi.mocked(axios.get);

describe("gibert", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    readGibertSearchEvidence.mockReset();
    promoteGibertSearchEvidence.mockReset();
    readGibertSearchEvidence.mockResolvedValue(null);
    promoteGibertSearchEvidence.mockResolvedValue(undefined);
  });

  it("construit l'URL Magento catalogsearch", () => {
    expect(gibertSearchUrl("9782070360024")).toContain(
      "catalogsearch/result/?q=9782070360024",
    );
  });

  it("parse les liens product-item-link", () => {
    const hits = parseGibertSearchHits(`
      <a class="product-item-link" href="https://www.gibert.com/etranger-9782070360024.html">L'Étranger</a>
    `);
    expect(hits[0]).toMatchObject({
      title: "L'Étranger",
      barcode: "9782070360024",
    });
  });

  it("parse JSON-LD Product", () => {
    const product = parseGibertProductPage(
      `<!DOCTYPE html><html><head>
        <script type="application/ld+json">
        {
          "@type":"Book",
          "name":"L'Étranger",
          "isbn":"9782070360024",
          "gtin13":"9782070360024",
          "author":{"@type":"Person","name":"Albert Camus"},
          "publisher":{"@type":"Organization","name":"Gallimard"},
          "image":"https://www.gibert.com/media/cover.jpg",
          "offers":{"@type":"Offer","price":6.2,"priceCurrency":"EUR","itemCondition":"https://schema.org/UsedCondition"}
        }
        </script>
      </head><body></body></html>`,
      "https://www.gibert.com/etranger-9782070360024.html",
    );
    expect(product).toMatchObject({
      title: "L'Étranger",
      barcode: "9782070360024",
      authors: ["Albert Camus"],
      publisher: "Gallimard",
      priceCents: 620,
      condition: "used",
    });
    const metadata = mapGibertMetadata(product);
    expect(metadata?.facts?.find((f) => f.kind === "price")?.label).toBe(
      "Occasion",
    );
  });

  it("guards empty search queries", async () => {
    await expect(searchGibertHits("")).resolves.toEqual([]);
    expect(gibertSearchUrl("")).toContain("q=");
  });

  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    const hits = [
      {
        title: "L'Étranger",
        productUrl: "https://www.gibert.com/etranger-9782070360024.html",
        barcode: "9782070360024",
      },
    ];
    readGibertSearchEvidence.mockResolvedValueOnce(hits);

    await expect(searchGibertHits("9782070360024")).resolves.toEqual(hits);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteGibertSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: `
        <a class="product-item-link" href="https://www.gibert.com/etranger-9782070360024.html">L'Étranger</a>
      `,
    } as never);

    const hits = await searchGibertHits("9782070360024");
    expect(hits[0]).toMatchObject({ barcode: "9782070360024" });
    expect(promoteGibertSearchEvidence).toHaveBeenCalledWith(
      expect.stringContaining("/catalogsearch/result/?q=9782070360024"),
      expect.arrayContaining([
        expect.objectContaining({ barcode: "9782070360024" }),
      ]),
    );
  });
});
