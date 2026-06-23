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

    expect(await fetchFromAchatMoinsCher("5021290082728")).toEqual([]);
    expect(mockedGet).not.toHaveBeenCalled();
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
});
