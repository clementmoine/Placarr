import { describe, expect, it } from "vitest";

import {
  loadS1FrPrerelease,
  mergeS1FrPrerelease,
  s1FrPrereleasePrintKey,
} from "./s1FrPrerelease";
import type { NarutoPrintRow, NarutoTitleRow } from "../indexStore";

describe("s1FrPrerelease", () => {
  it("mints distinct prerelease printKeys", () => {
    expect(s1FrPrereleasePrintKey("ni019")).toBe("naruto:ni-0019-prerelease");
    expect(s1FrPrereleasePrintKey("ta005")).toBe("naruto:ta-0005-prerelease");
    expect(s1FrPrereleasePrintKey("te036-prerelease")).toBe(
      "naruto:te-0036-prerelease",
    );
  });

  it("loads the ten manga variants from the ledger", () => {
    expect(loadS1FrPrerelease().map((c) => c.number)).toEqual([
      "ni025",
      "ni019",
      "ni047",
      "ni027",
      "ta005",
      "ta004",
      "te015",
      "te007",
      "te003",
      "te036",
    ]);
  });

  it("injects missing prerelease prints with FR titles", () => {
    const existing: NarutoPrintRow = {
      printKey: "naruto:ni-0019",
      setCode: "s1",
      number: "ni0019",
      cardType: "ni",
    };
    const titles: NarutoTitleRow[] = [
      {
        printKey: "naruto:ni-0019",
        lang: "fr",
        fullName: "Naruto Uzumaki",
        rarity: "holo",
      },
    ];
    const merged = mergeS1FrPrerelease({
      prints: [existing],
      titles,
      cards: [
        { number: "ni019", name: "Naruto Uzumaki" },
        { number: "ta005", name: "Le désastre Kyubi" },
      ],
    });
    expect(merged.addedPrints.sort()).toEqual([
      "naruto:ni-0019-prerelease",
      "naruto:ta-0005-prerelease",
    ]);
    expect(
      merged.prints.find((p) => p.printKey === "naruto:ni-0019-prerelease"),
    ).toMatchObject({
      setCode: "prerelease",
      number: "ni0019-prerelease",
      grouping: "prerelease",
    });
    expect(
      merged.titles.find((t) => t.printKey === "naruto:ta-0005-prerelease"),
    ).toMatchObject({
      fullName: "Le désastre Kyubi",
      rarity: "prerelease",
      lang: "fr",
    });
    expect(merged.prints.find((p) => p.printKey === "naruto:ni-0019")).toEqual(
      existing,
    );
  });

  it("rememberships legacy s1 prerelease prints onto the prerelease series", () => {
    const legacy: NarutoPrintRow = {
      printKey: "naruto:ni-0019-prerelease",
      setCode: "s1",
      number: "ni0019-prerelease",
      cardType: "ni",
      grouping: "prerelease",
    };
    const merged = mergeS1FrPrerelease({
      prints: [legacy],
      titles: [
        {
          printKey: "naruto:ni-0019-prerelease",
          lang: "fr",
          fullName: "Naruto Uzumaki",
          rarity: "prerelease",
        },
      ],
      cards: [{ number: "ni019", name: "Naruto Uzumaki" }],
    });
    expect(merged.addedPrints).toEqual([]);
    expect(
      merged.prints.find((p) => p.printKey === "naruto:ni-0019-prerelease"),
    ).toMatchObject({ setCode: "prerelease" });
  });
});
