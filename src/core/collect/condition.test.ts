import { describe, expect, it } from "vitest";

import {
  isItemCondition,
  ITEM_CONDITIONS,
  itemConditionsForShelfType,
  marketOfferConditionsForItem,
  parseItemCondition,
  shelfShowsItemCondition,
} from "./condition";

describe("item conditions", () => {
  it("lists grades from best to worst", () => {
    expect(ITEM_CONDITIONS).toEqual(["new", "used", "loose", "damaged"]);
  });

  it("offers loose on games and hardware only", () => {
    expect(itemConditionsForShelfType("games")).toEqual(ITEM_CONDITIONS);
    expect(itemConditionsForShelfType("hardware")).toEqual(ITEM_CONDITIONS);
    expect(itemConditionsForShelfType("books")).toEqual([
      "new",
      "used",
      "damaged",
    ]);
    expect(itemConditionsForShelfType("boardgames")).not.toContain("loose");
  });

  it("accepts known grades only", () => {
    expect(isItemCondition("loose")).toBe(true);
    expect(isItemCondition("likeNew")).toBe(false);
    expect(isItemCondition("fair")).toBe(false);
  });

  it("parses write conditions and maps retired grades", () => {
    expect(parseItemCondition("loose")).toBe("loose");
    expect(parseItemCondition("likeNew")).toBe("new");
    expect(parseItemCondition("fair")).toBe("used");
    expect(parseItemCondition("mint")).toBeNull();
    expect(parseItemCondition(undefined, "used")).toBe("used");
    expect(parseItemCondition(null, "new")).toBe("new");
  });

  it("maps used games toward CIB and shop used when CIB aggregate exists", () => {
    expect(
      marketOfferConditionsForItem("used", "games", { priceUsedCIB: 1200 }),
    ).toEqual(["cib", "used"]);
  });

  it("maps TCG used/new copies onto new and foil market rows", () => {
    expect(marketOfferConditionsForItem("new", "tcg")).toEqual(["new"]);
    expect(marketOfferConditionsForItem("used", "tcg")).toEqual(["new"]);
    expect(
      marketOfferConditionsForItem("used", "tcg", null, {
        variant: "Silver",
        plainFinishes: ["None"],
      }),
    ).toEqual(["foil"]);
    expect(
      marketOfferConditionsForItem("new", "tcg", null, { variant: "None" }),
    ).toEqual(["new"]);
  });

  it("attributes foil-only Enchanted offers still tagged as new", () => {
    expect(
      marketOfferConditionsForItem(
        "used",
        "tcg",
        {
          priceObservations: [
            { condition: "new" }, // stale Lorcast foil-only row
          ],
        },
        { variant: "Lore", plainFinishes: ["None"] },
      ),
    ).toEqual(["new"]);
    expect(
      marketOfferConditionsForItem(
        "used",
        "tcg",
        {
          priceObservations: [{ condition: "new" }, { condition: "foil" }],
        },
        { variant: "Lore", plainFinishes: ["None"] },
      ),
    ).toEqual(["foil"]);
  });

  it("hides item condition UI for TCG shelves", () => {
    expect(shelfShowsItemCondition("tcg")).toBe(false);
    expect(shelfShowsItemCondition("games")).toBe(true);
    expect(shelfShowsItemCondition("books")).toBe(true);
  });

  it("maps loose games and hardware to loose observations only", () => {
    expect(marketOfferConditionsForItem("loose", "games")).toEqual(["loose"]);
    expect(marketOfferConditionsForItem("loose", "hardware")).toEqual([
      "loose",
    ]);
  });
});
