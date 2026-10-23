import { describe, expect, it } from "vitest";

import { buildRequirements } from "./requirements";

describe("buildRequirements", () => {
  it("base-set collapses finishes into one hole per printKey", () => {
    const reqs = buildRequirements({
      mode: "base-set",
      rows: [
        {
          rowId: "pk1|Normal",
          printKey: "pk1",
          finish: "Normal",
          priceCents: 100,
          owned: false,
        },
        {
          rowId: "pk1|Foil",
          printKey: "pk1",
          finish: "Foil",
          priceCents: 500,
          owned: false,
        },
        {
          rowId: "pk2|Normal",
          printKey: "pk2",
          finish: "Normal",
          priceCents: 50,
          owned: true,
        },
      ],
    });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.id).toBe("pk1");
    expect(reqs[0]?.priceCents).toBe(100);
  });

  it("master-set keeps one hole per row", () => {
    const reqs = buildRequirements({
      mode: "master-set",
      rows: [
        {
          rowId: "pk1|Normal",
          printKey: "pk1",
          finish: "Normal",
          priceCents: 100,
          owned: false,
        },
        {
          rowId: "pk1|Foil",
          printKey: "pk1",
          finish: "Foil",
          priceCents: 500,
          owned: false,
        },
      ],
    });
    expect(reqs).toHaveLength(2);
    expect(reqs.map((r) => r.id).sort()).toEqual(["pk1|Foil", "pk1|Normal"]);
  });
});
