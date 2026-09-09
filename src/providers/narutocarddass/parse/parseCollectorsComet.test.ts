import { describe, expect, it } from "vitest";

import {
  cleanCollectorsCometProductName,
  collectorsCometEditionSetCode,
  mergeCollectorsCometIntoIndex,
  parseCollectorsCometProduct,
} from "./parseCollectorsComet";

describe("collectorsCometEditionSetCode", () => {
  it("maps booster and tournament editions", () => {
    expect(collectorsCometEditionSetCode("Set 9 - The Chosen")).toBe("s9");
    expect(collectorsCometEditionSetCode("Set 21.5 - Tournament Pack 3")).toBe(
      "tp3",
    );
    expect(collectorsCometEditionSetCode("Promos")).toBe("promo");
  });
});

describe("parseCollectorsCometProduct", () => {
  it("reads NUS and M refs from the shop API", () => {
    expect(
      parseCollectorsCometProduct(
        { name: "Choji Akimichi", number: "NUS-087" },
        "Set 9 - The Chosen",
      ),
    ).toMatchObject({
      number: "nus0087",
      name: "Choji Akimichi",
      setCode: "s9",
      printedRef: "N-US-087",
    });
    expect(
      parseCollectorsCometProduct(
        { name: "Frustrated Ambition", number: "M-274" },
        "Set 9 - The Chosen",
      ),
    ).toMatchObject({
      number: "m0274",
      name: "Frustrated Ambition",
      setCode: "s9",
    });
  });

  it("strips redundant printed ref suffixes from titles", () => {
    expect(cleanCollectorsCometProductName("Sasuke Uchiha (NUS-090)")).toBe(
      "Sasuke Uchiha",
    );
  });
});

describe("mergeCollectorsCometIntoIndex", () => {
  it("fills EN titles only onto existing prints", () => {
    const merged = mergeCollectorsCometIntoIndex({
      prints: [
        {
          printKey: "naruto:nus-0087",
          setCode: "s9",
          number: "nus0087",
          cardType: "n",
          family: "ninja",
        },
        {
          printKey: "naruto:n-0087",
          setCode: "s3",
          number: "n0087",
          cardType: "n",
          family: "ninja",
        },
      ],
      titles: [{ printKey: "naruto:n-0087", lang: "en", fullName: "Sakura" }],
      cards: [
        {
          number: "nus0087",
          name: "Choji Akimichi",
          setCode: "s9",
          printedRef: "N-US-087",
        },
      ],
    });
    expect(merged.titled).toEqual(["naruto:nus-0087"]);
    expect(merged.titles).toContainEqual({
      printKey: "naruto:nus-0087",
      lang: "en",
      fullName: "Choji Akimichi",
      nameSource: "collectors-comet",
    });
    expect(merged.titles).toHaveLength(2);
  });
});
