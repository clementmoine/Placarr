import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));

const readEspritJeuSearchEvidence = vi.fn();
const promoteEspritJeuSearchEvidence = vi.fn();

vi.mock("./durableEvidence", () => ({
  readEspritJeuSearchEvidence: (...args: unknown[]) =>
    readEspritJeuSearchEvidence(...args),
  promoteEspritJeuSearchEvidence: (...args: unknown[]) =>
    promoteEspritJeuSearchEvidence(...args),
}));

import axios from "axios";

import {
  parseEspritJeuProductHtml,
  parseEspritJeuProductImages,
  parseEspritJeuSearchHits,
  searchEspritJeuHits,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

const PRODUCT_URL =
  "https://www.espritjeu.com/jeu-de-societe/black-stories-mort-de-rire.html";

const PRODUCT_HTML = `
<html><head>
<meta property="og:title" content="Black Stories - Mort de Rire - Jeux de soci&eacute;t&eacute; - Acheter sur Espritjeu.com" />
<meta property="og:description" content="50 &eacute;nigmes lugubres &agrave; r&eacute;soudre !" />
<meta property="og:image" content="https://www.espritjeu.com/upload/image/black-stories---mort-de-rire-p-image-99838-moyenne.jpg" />
<meta itemprop="gtin13" content="0626570614616" />
</head><body>
<span itemprop="name" style="display:none;">Black Stories - Mort de Rire</span>
<div class="bp_prix"><div class="d-inline-block">12,50 &euro;</div></div>
<a href="https://www.espritjeu.com/upload/image/black-stories---mort-de-rire-p-image-99838-grande.jpg"></a>
<a href="https://www.espritjeu.com/upload/image/black-stories---mort-de-rire-p-image-99839-grande.jpg"></a>
</body></html>`;

const SEARCH_HTML = `
<div class="bp_footer">
<h3 class="bp_designation">
<a href="https://www.espritjeu.com/jeu-de-societe/black-stories-mort-de-rire.html">
Black Stories - Mort de Rire
</a>
</h3>
</div>`;

beforeEach(() => {
  mockedGet.mockReset();
  readEspritJeuSearchEvidence.mockReset();
  promoteEspritJeuSearchEvidence.mockReset();
  readEspritJeuSearchEvidence.mockResolvedValue(null);
  promoteEspritJeuSearchEvidence.mockResolvedValue(undefined);
});

describe("parseEspritJeuSearchHits", () => {
  it("extracts product URLs and listing titles", () => {
    expect(parseEspritJeuSearchHits(SEARCH_HTML)).toEqual([
      {
        url: PRODUCT_URL,
        title: "Black Stories - Mort de Rire",
      },
    ]);
  });
});

describe("parseEspritJeuProductHtml", () => {
  it("extracts title, barcode, price and gallery images", () => {
    const product = parseEspritJeuProductHtml(PRODUCT_HTML, PRODUCT_URL);
    expect(product.title).toBe("Black Stories - Mort de Rire");
    expect(product.barcode).toBe("0626570614616");
    expect(product.priceCents).toBe(1250);
    expect(product.images).toEqual([
      "https://www.espritjeu.com/upload/image/black-stories---mort-de-rire-p-image-99838-grande.jpg",
      "https://www.espritjeu.com/upload/image/black-stories---mort-de-rire-p-image-99839-grande.jpg",
    ]);
    expect(product.imageUrl).toBe(
      "https://www.espritjeu.com/upload/image/black-stories---mort-de-rire-p-image-99838-grande.jpg",
    );
  });
});

describe("parseEspritJeuProductImages", () => {
  it("ignores promotional banner assets", () => {
    const html = `
      <a href="https://www.espritjeu.com/upload/image/offre-happy-weeks-ete-2026-image-113657-grande.png"></a>
      <a href="https://www.espritjeu.com/upload/image/black-stories---mort-de-rire-p-image-99838-grande.jpg"></a>`;
    expect(parseEspritJeuProductImages(html)).toEqual([
      "https://www.espritjeu.com/upload/image/black-stories---mort-de-rire-p-image-99838-grande.jpg",
    ]);
  });
});

describe("searchEspritJeuHits", () => {
  it("réutilise ProviderEvidence SearchYield sans HTTP", async () => {
    readEspritJeuSearchEvidence.mockResolvedValueOnce([
      { url: PRODUCT_URL, title: "Black Stories - Mort de Rire" },
    ]);

    await expect(searchEspritJeuHits("Black Stories")).resolves.toEqual([
      { url: PRODUCT_URL, title: "Black Stories - Mort de Rire" },
    ]);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(promoteEspritJeuSearchEvidence).not.toHaveBeenCalled();
  });

  it("promotes SearchYield after a live search GET", async () => {
    mockedGet.mockResolvedValueOnce({
      status: 200,
      data: SEARCH_HTML,
    } as never);

    await expect(searchEspritJeuHits("Black Stories")).resolves.toEqual([
      { url: PRODUCT_URL, title: "Black Stories - Mort de Rire" },
    ]);
    expect(promoteEspritJeuSearchEvidence).toHaveBeenCalledWith(
      "https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=Black%20Stories",
      [{ url: PRODUCT_URL, title: "Black Stories - Mort de Rire" }],
    );
  });
});
