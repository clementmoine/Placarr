import { describe, expect, it } from "vitest";

import {
  filterEbayProductsForGameShelf,
  prepareEbayProductsForGameShelf,
} from "./platformFilter";
import type { EbayProduct } from "./types";

const product = (name: string, catalog = false): EbayProduct => ({
  name,
  coverUrl: "https://i.ebayimg.com/x.jpg",
  catalog,
});

describe("prepareEbayProductsForGameShelf", () => {
  it("drops cross-platform marketplace listings on an Xbox 360 shelf", () => {
    const input = [
      product("BIENVENUE CHEZ LES ROBINSON"),
      product("BIENVENUE CHEZ LES ROBINSON PLAYSTATION 2 TESTE"),
      product("Bienvenue Chez Les Robinson - Nintendo Wii"),
    ];

    expect(
      prepareEbayProductsForGameShelf(
        input,
        "xbox360",
        "Bienvenue chez les Robinson",
      ),
    ).toEqual([]);
  });

  it("prefers a platform-explicit listing over a generic one", () => {
    const input = [
      product("BIENVENUE CHEZ LES ROBINSON"),
      product("Bienvenue chez les Robinson Xbox 360"),
    ];

    expect(
      prepareEbayProductsForGameShelf(
        input,
        "xbox360",
        "Bienvenue chez les Robinson",
      ).map((entry) => entry.name),
    ).toEqual(["Bienvenue chez les Robinson Xbox 360"]);
  });

  it("filters DVD marketplace hits on a game shelf", () => {
    expect(
      filterEbayProductsForGameShelf(
        [product("Bienvenue chez les Robinson DVD")],
        "xbox360",
        "Bienvenue chez les Robinson",
      ),
    ).toEqual([]);
  });
});
