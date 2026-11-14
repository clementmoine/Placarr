import { describe, expect, it } from "vitest";

import {
  primaryTradeCounterpartName,
  tradeLinksForItem,
} from "@/core/collect/itemTrade";

describe("tradeLinksForItem", () => {
  it("lists counterparts from both directions without dupes", () => {
    const links = tradeLinksForItem("a", {
      out: [
        {
          id: "l1",
          note: null,
          createdAt: "2026-01-01",
          itemOutId: "a",
          itemInId: "b",
          itemIn: { id: "b", name: "Luffy", shelfId: "s1", slug: "luffy" },
        },
      ],
      in: [
        {
          id: "l2",
          note: "retour",
          createdAt: "2026-01-02",
          itemOutId: "c",
          itemInId: "a",
          itemOut: { id: "c", name: "Zoro", shelfId: "s1", slug: "zoro" },
        },
      ],
    });
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.counterpart.name).sort()).toEqual([
      "Luffy",
      "Zoro",
    ]);
    expect(primaryTradeCounterpartName(links)).toBe("Luffy");
  });
});
