import { describe, expect, it } from "vitest";

import {
  isItemCondition,
  ITEM_CONDITIONS,
  itemConditionsForShelfType,
  marketOfferConditionsForItem,
  parseItemCondition,
} from "./condition";

describe("item conditions", () => {
  it("lists grades from best to worst", () => {
    expect(ITEM_CONDITIONS).toEqual(["new", "used", "loose", "damaged"]);
  });

  it("hides loose outside game shelves", () => {
    expect(itemConditionsForShelfType("games")).toEqual(ITEM_CONDITIONS);
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

  it("maps loose games to loose observations only", () => {
    expect(marketOfferConditionsForItem("loose", "games")).toEqual(["loose"]);
  });
});
