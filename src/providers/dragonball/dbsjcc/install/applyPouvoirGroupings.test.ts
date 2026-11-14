import { describe, expect, it } from "vitest";

import { dbsjccPrintKey } from "../printKey";
import { powerToGroupingSlug } from "../scrape/dbzcollection";
import { normalizeGrouping } from "../printKey";

describe("singleton pouvoir key shape", () => {
  it("builds lettered + grouping keys for Main / Kaio reprints", () => {
    expect(
      dbsjccPrintKey(
        "part5",
        "d0153b",
        normalizeGrouping(powerToGroupingSlug("Main")),
      ),
    ).toBe("dbsjcc:part5-d0153b-main");
    expect(
      dbsjccPrintKey(
        "part4",
        "d0250b",
        normalizeGrouping(powerToGroupingSlug("Monde de kaio")),
      ),
    ).toBe("dbsjcc:part4-d0250b-kaio");
  });
});
