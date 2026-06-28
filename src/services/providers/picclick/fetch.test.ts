import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
import axios from "axios";

import {
  fetchPicClickProductsByQuery,
  fetchPricesFromPicClick,
} from "./fetch";

const mockedGet = vi.mocked(axios.get);

function itemHtml(title: string, price: string, href = "/item/1") {
  return `<li id="item-1">
    <a href="${href}">
      <img title="${title}" />
      <h3 title="${title}">${title}</h3>
      <div class="price">${price}</div>
    </a>
  </li>`;
}

function productListHtml(
  items: Array<{ title: string; img?: string }>,
  startId = 1,
) {
  return items
    .map(
      ({ title, img = "https://img.example/1.jpg" }, index) =>
        `<li id="item-${startId + index}"><img src="${img}" title="${title}" /></li>`,
    )
    .join("");
}

beforeEach(() => {
  mockedGet.mockReset();
});

describe("fetchPicClickProductsByQuery", () => {
  it("accepte une jaquette jeu quand le titre matche", async () => {
    mockedGet.mockResolvedValue({
      data: productListHtml([
        {
          title: "Life is Strange PS4 PlayStation Hits",
        },
      ]),
    } as never);

    await expect(
      fetchPicClickProductsByQuery("Life is Strange PS4", [
        "Life is Strange",
        "Life is Strange PS4",
      ]),
    ).resolves.toEqual([
      {
        name: "Life is Strange PS4 PlayStation Hits",
        coverUrl: "https://img.example/1.jpg",
      },
    ]);
  });

  it("ignore une annonce BD/comics quand on cherche le jeu", async () => {
    mockedGet.mockResolvedValue({
      data: productListHtml([
        {
          title: "Life is Strange - Collection Comics Tome 1",
        },
        {
          title: "Life is Strange PS4 PlayStation Hits",
        },
      ]),
    } as never);

    await expect(
      fetchPicClickProductsByQuery("5026555394025", [
        "Life is Strange",
        "Life is Strange PS4",
      ]),
    ).resolves.toEqual([
      {
        name: "Life is Strange PS4 PlayStation Hits",
        coverUrl: "https://img.example/1.jpg",
      },
    ]);
  });
});

describe("fetchPricesFromPicClick", () => {
  it("accepte une annonce qui matche le titre demandé", async () => {
    mockedGet.mockResolvedValue({
      data: itemHtml(
        "The Last of Us Part I PS5",
        "EUR 24,99",
        "https://ebay.example/tlou1",
      ),
    } as never);

    await expect(
      fetchPricesFromPicClick("The Last of Us Part I", [
        "The Last of Us Part I",
      ]),
    ).resolves.toMatchObject({
      priceUsed: 2499,
      productName: "The Last of Us Part I PS5",
    });
  });

  it("ignore une annonce Part II quand on cherche Part I", async () => {
    mockedGet.mockResolvedValue({
      data: [
        itemHtml("The Last of Us Part II PS4", "EUR 19,99"),
        itemHtml("The Last of Us Part I PS5", "EUR 24,99"),
      ].join(""),
    } as never);

    await expect(
      fetchPricesFromPicClick("The Last of Us Part I", [
        "The Last of Us Part I",
      ]),
    ).resolves.toMatchObject({
      priceUsed: 2499,
      productName: "The Last of Us Part I PS5",
      offerCount: 1,
    });
  });

  it("ignore une annonce comics quand on cherche le jeu", async () => {
    mockedGet.mockResolvedValue({
      data: [
        itemHtml("Life is Strange - Comics Tome 1", "EUR 9,99"),
        itemHtml("Life is Strange PS4", "EUR 14,99"),
      ].join(""),
    } as never);

    await expect(
      fetchPricesFromPicClick("Life is Strange PS4", ["Life is Strange PS4"]),
    ).resolves.toMatchObject({
      priceUsed: 1499,
      productName: "Life is Strange PS4",
      offerCount: 1,
    });
  });
});
