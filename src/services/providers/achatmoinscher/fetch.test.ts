import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({
  default: { post: vi.fn(), get: vi.fn(), head: vi.fn() },
}));
import axios from "axios";

import {
  fetchFromAchatMoinsCher,
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
    </table>
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

beforeEach(() => {
  mockedPost.mockReset();
  mockedGet.mockReset();
  mockedHead.mockReset();
});

describe("fetchFromAchatMoinsCher", () => {
  it("parse le titre, la plateforme, la jaquette et les prix depuis la page produit", async () => {
    mockedPost.mockResolvedValue({ data: "12345" } as never);
    mockedGet.mockResolvedValue({ data: PRODUCT_HTML } as never);
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
        priceNew: 3999,
        priceUsed: 1999,
      },
    ]);
  });

  it("renvoie une liste vide quand le scanner ne retourne pas d'id produit", async () => {
    mockedPost.mockResolvedValue({ data: "not-found" } as never);
    mockedGet.mockResolvedValue({ data: "" } as never);

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
      .mockResolvedValueOnce({ data: wrongProductHtml } as never)
      .mockResolvedValueOnce({
        data: `
          <div class="product">
            <img alt="Little Nightmares PS4" onclick="ia(1); vProd('12345');" />
          </div>
        `,
      } as never)
      .mockResolvedValueOnce({ data: goodProductHtml } as never);
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
        coverUrl: "https://cdn.example.com/photoProd/zoom/little-nightmares.jpg",
      },
    ]);
  });

  it("ignore une jaquette dont le nom de fichier ne correspond pas au titre produit", async () => {
    mockedPost.mockResolvedValue({ data: "491080872" } as never);
    mockedGet.mockResolvedValue({
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
});

describe("fetchPricesFromAchatMoinsCher", () => {
  it("extrait le prix neuf minimum et le prix occasion", async () => {
    mockedPost.mockResolvedValue({ data: "12345" } as never);
    mockedGet.mockResolvedValue({ data: PRODUCT_HTML } as never);

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
        data: `
          <div class="product">
            <img alt="Wheelman PS3" onclick="ia(1); vProd('12345');" />
          </div>
        `,
      } as never)
      .mockResolvedValueOnce({ data: PRODUCT_HTML } as never);

    await expect(
      fetchPricesFromAchatMoinsCher("Wheelman PS3", ["Wheelman PS3"]),
    ).resolves.toEqual({
      priceNew: 3999,
      priceUsed: 1999,
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
