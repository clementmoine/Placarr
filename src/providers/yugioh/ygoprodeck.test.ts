import { describe, expect, it } from "vitest";

import {
  expandYgoprodeckCardPrints,
  primaryYgoprodeckImageUrl,
  type YgoprodeckCard,
} from "./ygoprodeck";

describe("ygoprodeck expand", () => {
  const sample: YgoprodeckCard = {
    id: 46986414,
    name: "Dark Magician",
    card_sets: [
      { set_code: "LOB-EN005", set_rarity: "Ultra Rare" },
      { set_code: "LDD-F005", set_rarity: "Ultra Rare" },
      { set_code: "bad" },
    ],
    card_images: [
      {
        id: 46986414,
        image_url: "https://images.ygoprodeck.com/images/cards/46986414.jpg",
      },
    ],
  };

  it("expands valid set codes into printKeys", () => {
    const rows = expandYgoprodeckCardPrints(sample);
    expect(rows.map((r) => r.printKey)).toEqual([
      "yugioh:lob-en005",
      "yugioh:ldd-f005",
    ]);
    expect(rows[0]?.passcode).toBe(46986414);
  });

  it("reads primary image URL", () => {
    expect(primaryYgoprodeckImageUrl(sample)).toContain("46986414.jpg");
  });
});
