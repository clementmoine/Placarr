import { describe, expect, it } from "vitest";

import type { NikitaCardFacts } from "../parse/parseNikitaCardlist";
import { factsByDiskId } from "./scrapeNikitaCardlist";

function facts(over: Partial<NikitaCardFacts>): NikitaCardFacts {
  return {
    game: "nrt",
    nikitaKey: "N-001",
    number: "ni0001",
    printedRef: "忍-1",
    name: "うずまきナルト",
    cardType: "忍",
    setLabel: "巻ノ壱",
    setCode: "maki1",
    symbols: ["雷"],
    cost: 0,
    power: 1,
    support: 0,
    woundedPower: 3,
    woundedSupport: 1,
    traits: ["木ノ葉"],
    battleAttribute: "忍",
    target: null,
    effect: null,
    quote: null,
    ...over,
  };
}

describe("factsByDiskId", () => {
  it("keys on the disk id and drops what the catalogue does not mint", () => {
    const out = factsByDiskId([
      facts({}),
      facts({ number: null, printedRef: "N-999" }),
    ]);
    expect(Object.keys(out)).toEqual(["ni0001"]);
  });

  it("keeps a reprint whole when it says something different", () => {
    // 忍-1 is listed twice with a different flavour line: two printings, not
    // one row to fold away.
    const out = factsByDiskId([
      facts({ setLabel: "巻ノ壱", setCode: "maki1", quote: "オレってば…" }),
      facts({
        setLabel: "※確認中1",
        setCode: null,
        quote: "風雲姫は、オレが守る",
      }),
    ]);
    expect(out.ni0001?.quote).toBe("オレってば…");
    expect(out.ni0001?.variants).toHaveLength(1);
    expect(out.ni0001?.variants?.[0]?.quote).toBe("風雲姫は、オレが守る");
    // A real difference is not filed as a mere alternate label.
    expect(out.ni0001?.alsoListedIn).toBeUndefined();
  });

  it("separates a reworded reprint from a duplicate listing", () => {
    const out = factsByDiskId([
      facts({
        number: "te0146",
        setLabel: "巻ノ八",
        setCode: "maki8",
        effect: "目標は+2/±0を得る。",
      }),
      facts({
        number: "te0146",
        setLabel: "巻ノ十",
        setCode: "maki10",
        effect: "目標はターン中、+2/±0を得る。",
      }),
    ]);
    expect(out.te0146?.setLabel).toBe("巻ノ八");
    expect(out.te0146?.variants?.[0]?.setLabel).toBe("巻ノ十");
    expect(out.te0146?.variants?.[0]?.effect).toContain("ターン中");
  });

  it("prefers a confirmed volume over a ※確認中 bucket, whatever the order", () => {
    const unverifiedFirst = factsByDiskId([
      facts({ setLabel: "※確認中1", setCode: null }),
      facts({ setLabel: "巻ノ壱", setCode: "maki1" }),
    ]);
    expect(unverifiedFirst.ni0001?.setLabel).toBe("巻ノ壱");
    expect(unverifiedFirst.ni0001?.alsoListedIn).toEqual(["※確認中1"]);

    const volumeFirst = factsByDiskId([
      facts({ setLabel: "巻ノ壱", setCode: "maki1" }),
      facts({ setLabel: "※確認中1", setCode: null }),
      facts({ setLabel: "※確認中2", setCode: null }),
    ]);
    expect(volumeFirst.ni0001?.setLabel).toBe("巻ノ壱");
    expect(volumeFirst.ni0001?.alsoListedIn).toEqual(["※確認中1", "※確認中2"]);
  });

  it("does not repeat the kept label in alsoListedIn", () => {
    const out = factsByDiskId([
      facts({ setLabel: "巻ノ壱", setCode: "maki1" }),
      facts({ setLabel: "巻ノ壱", setCode: "maki1" }),
    ]);
    expect(out.ni0001?.alsoListedIn).toBeUndefined();
  });
});
