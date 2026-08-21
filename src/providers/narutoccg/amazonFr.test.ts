import { describe, expect, it } from "vitest";

import amazonFr from "./curated/sources/amazon-fr.json";
import trictrac from "./curated/sources/trictrac.json";
import vialudibunda from "./curated/sources/vialudibunda.json";

describe("Amazon FR starter S1 B0019R7M2W", () => {
  it("records the SKU without ingesting a missing packshot", () => {
    expect(amazonFr.ingest).toBe("none");
    expect(amazonFr.asin).toBe("B0019R7M2W");
    expect(amazonFr.printedRef).toBe("05110");
    expect(amazonFr.slug).toBe("starter-pays-du-vent");
    expect(amazonFr.doNotDisplace).toBe(
      "staging/trictrac/starter-pays-du-vent.jpeg",
    );
    expect(
      vialudibunda.products.find((row) => row.slug === amazonFr.slug)
        ?.printedRef,
    ).toBe("05110");
    expect(
      trictrac.products.some((row) => row.slug === "starter-pays-du-vent"),
    ).toBe(true);
  });
});
