import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: { post: vi.fn(), get: vi.fn(), head: vi.fn() },
}));
import axios from "axios";

import { resetAchatMoinsCherResponseCacheForTests } from "./cache";
import {
  fetchFromAchatMoinsCher,
  fetchFromAchatMoinsCherByQuery,
  fetchPricesFromAchatMoinsCher,
} from "./fetch";

const mockedPost = vi.mocked(axios.post);
const mockedGet = vi.mocked(axios.get);
const mockedHead = vi.mocked(axios.head);

const PRODUCT_HTML = `
<html>
  <body>
    <h1>Sony Wheelman</h1>
    <table>
      <tr><td>Plateforme</td><td>PlayStation 3</td></tr>
      <tr><td>Marque</td><td><b>Sony</b></td></tr>
      <tr><td>Catégorie</td><td><b>Jeux vidéo</b></td></tr>
    </table>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","brand":{"@type":"Brand","name":"Sony"},"category":"Jeux vidéo","name":"Wheelman"}</script>
    <div class="col-md-12 imgIco">
      <img src="//cdn.example.com/photoProd/zoom/wheelman.jpg" alt="Wheelman" />
    </div>
    <div id="tabBestPrix">
      <div id="neuf12345">
        <p class="prix">39,99&nbsp;€</p>
        <p class="prix">44,99&nbsp;€</p>
      </div>
      <div id="occasion12345">
        <p class="prix">19,99&nbsp;€</p>
      </div>
    </div>
  </body>
</html>
`;

const SEARCH_HTML = `
  <div class="product">
    <img alt="Wheelman PS3" onclick="ia(1); vProd('12345');" />
  </div>
`;

beforeEach(() => {
  mockedPost.mockReset();
  mockedGet.mockReset();
  mockedHead.mockReset();
  resetAchatMoinsCherResponseCacheForTests();
  delete process.env.FLARESOLVERR_URL;
});

describe("fetchFromAchatMoinsCher", () => {
  it("parse le titre, la plateforme, la jaquette et les prix depuis la page produit", async () => {
    mockedPost.mockResolvedValue({ data: "12345" } as never);
    mockedGet.mockResolvedValue({ status: 200, data: PRODUCT_HTML } as never);
    mockedHead.mockResolvedValue({ status: 200 } as never);

    // A single barcode resolves to one product page, so the identify call also
    // captures its prices (new + used) — no extra request.
    const products = await fetchFromAchatMoinsCher("5021290082728");
    expect(products).toEqual([
      {
        name: "Wheelman (PlayStation 3)",
        productId: "12345",
        productUrl: "https://www.achatmoinscher.com/12345.html",
        coverUrl: "https://cdn.example.com/photoProd/zoom/wheelman.jpg",
        category: "Jeux vidéo",
        brand: "Sony",
        priceNew: 3999,
        priceUsed: 1999,
      },
    ]);
  });

  it("extrait catégorie DVD et marque Disney depuis la fiche film", async () => {
    const dvdHtml = `
      <h1>Tout le monde aime Tic &amp; Tac - Volume 2</h1>
      <table class="tableauCarac">
        <tr><td>Marque</td><td><b>DISNEY JUNIOR</b></td></tr>
        <tr><td>Catégorie</td><td><b>DVD</b></td></tr>
      </table>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","brand":{"@type":"Brand","name":"DISNEY JUNIOR"},"category":"DVD","name":"Tout le monde aime Tic & Tac - Volume 2","gtin13":"8717418035617"}</script>
      <div id="tabBestPrix"><div id="neuf232875"><p class="prix">9,99&nbsp;€</p></div></div>
    `;
    mockedPost.mockResolvedValue({ data: "232875" } as never);
    mockedGet.mockResolvedValue({ status: 200, data: dvdHtml } as never);

    const products = await fetchFromAchatMoinsCher("8717418035617");
    expect(products[0]).toMatchObject({
      name: "Tout le monde aime Tic & Tac - Volume 2",
      category: "DVD",
      brand: "DISNEY JUNIOR",
    });
  });

  it("renvoie une liste vide quand le scanner ne retourne pas d'id produit", async () => {
    mockedPost.mockResolvedValue({ data: "not-found" } as never);
    mockedGet.mockResolvedValue({ status: 200, data: "" } as never);

    expect(
      await fetchFromAchatMoinsCher("5021290082728", ["Wheelman PS3"]),
    ).toEqual([]);
  });

  it("ignore un produit barcode non aligné et retombe sur la recherche par nom", async () => {
    const wrongProductHtml = `
      <h1>Devil May Cry HD Collection (PlayStation 4)</h1>
      <div class="col-md-12 imgIco">
        <img src="//cdn.example.com/photoProd/zoom/dmc.jpg" alt="Devil May Cry HD Collection" />
      </div>
    `;
    const goodProductHtml = `
      <h1>Little Nightmares (PlayStation 4)</h1>
      <div class="col-md-12 imgIco">
        <img src="//cdn.example.com/photoProd/zoom/little-nightmares.jpg" alt="Little Nightmares" />
      </div>
    `;

    mockedPost.mockResolvedValue({ data: "99999" } as never);
    mockedGet
      .mockResolvedValueOnce({ status: 200, data: wrongProductHtml } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: `
          <div class="product">
            <img alt="Little Nightmares PS4" onclick="ia(1); vProd('12345');" />
          </div>
        `,
      } as never)
      .mockResolvedValueOnce({ status: 200, data: goodProductHtml } as never);
    mockedHead.mockResolvedValue({ status: 200 } as never);

    await expect(
      fetchFromAchatMoinsCher("5056635607447", [
        "Little Nightmares",
        "Little Nightmares PS4",
      ]),
    ).resolves.toEqual([
      {
        name: "Little Nightmares (PlayStation 4)",
        productId: "12345",
        productUrl: "https://www.achatmoinscher.com/12345.html",
        coverUrl:
          "https://cdn.example.com/photoProd/zoom/little-nightmares.jpg",
      },
    ]);
  });

  it("ignore une jaquette dont le nom de fichier ne correspond pas au titre produit", async () => {
    mockedPost.mockResolvedValue({ data: "491080872" } as never);
    mockedGet.mockResolvedValue({
      status: 200,
      data: `
        <h1>Outer Wilds Archaeologist Edition PS5</h1>
        <div class="col-md-12 imgIco">
          <img src="https://www.achatmoinscher.com/photoProd/zoom/2309/the-walking-dead-saints-and-sinners-chapter-2-retribution-payback-edit-203847518.jpg" />
        </div>
      `,
    } as never);
    mockedHead.mockResolvedValue({ status: 200 } as never);

    const products = await fetchFromAchatMoinsCher("5056635607447");
    expect(products[0]?.name).toContain("Outer Wilds");
    expect(products[0]?.coverUrl).toBeNull();
  });

  it("rejette Sirènes quand Femmes Fatales est attendu", async () => {
    const wrongProductHtml = `
      <h1>Sirènes : femmes fatales</h1>
      <div class="col-md-12 imgIco">
        <img src="//cdn.example.com/photoProd/zoom/sirenes-femmes-fatales.jpg" alt="Sirènes" />
      </div>
    `;

    mockedPost.mockResolvedValue({ data: "294939463" } as never);
    mockedGet.mockResolvedValue({
      status: 200,
      data: wrongProductHtml,
    } as never);
    mockedHead.mockResolvedValue({ status: 200 } as never);

    await expect(
      fetchFromAchatMoinsCher("0721450083770", [
        "Black Stories - Femmes Fatales",
      ]),
    ).resolves.toEqual([]);
  });
});

describe("fetchPricesFromAchatMoinsCher", () => {
  it("extrait le prix neuf minimum et le prix occasion", async () => {
    mockedPost.mockResolvedValue({ data: "12345" } as never);
    mockedGet.mockResolvedValue({ status: 200, data: PRODUCT_HTML } as never);

    await expect(
      fetchPricesFromAchatMoinsCher("5021290082728"),
    ).resolves.toEqual({
      priceNew: 3999,
      priceUsed: 1999,
    });
  });

  it("recherche par titre quand le barcode est absent", async () => {
    mockedGet
      .mockResolvedValueOnce({
        status: 200,
        data: SEARCH_HTML,
      } as never)
      .mockResolvedValueOnce({ status: 200, data: PRODUCT_HTML } as never);

    await expect(
      fetchPricesFromAchatMoinsCher("Wheelman PS3", ["Wheelman PS3"]),
    ).resolves.toEqual({
      priceNew: 3999,
      priceUsed: 1999,
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it("réutilise SearchYield + fiche HTML après metadata (0 HTTP extra)", async () => {
    mockedGet
      .mockResolvedValueOnce({ status: 200, data: SEARCH_HTML } as never)
      .mockResolvedValueOnce({ status: 200, data: PRODUCT_HTML } as never);
    mockedHead.mockResolvedValue({ status: 200 } as never);

    await expect(
      fetchFromAchatMoinsCherByQuery("Wheelman PS3", ["Wheelman PS3"]),
    ).resolves.toMatchObject([
      {
        name: "Wheelman (PlayStation 3)",
        priceNew: 3999,
        priceUsed: 1999,
      },
    ]);
    const httpAfterMeta = mockedGet.mock.calls.length;

    await expect(
      fetchPricesFromAchatMoinsCher("Wheelman PS3", ["Wheelman PS3"]),
    ).resolves.toEqual({
      priceNew: 3999,
      priceUsed: 1999,
    });

    expect(mockedGet.mock.calls.length).toBe(httpAfterMeta);
  });

  it("réutilise la fiche HTML barcode metadata → prix (0 GET extra)", async () => {
    mockedPost.mockResolvedValue({ data: "12345" } as never);
    mockedGet.mockResolvedValue({ status: 200, data: PRODUCT_HTML } as never);
    mockedHead.mockResolvedValue({ status: 200 } as never);

    await fetchFromAchatMoinsCher("5021290082728");
    const httpAfterMeta = mockedGet.mock.calls.length;

    await expect(
      fetchPricesFromAchatMoinsCher("5021290082728"),
    ).resolves.toEqual({
      priceNew: 3999,
      priceUsed: 1999,
    });

    expect(mockedGet.mock.calls.length).toBe(httpAfterMeta);
  });
});
