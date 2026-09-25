import { describe, expect, it } from "vitest";

import { colekaCarddassDealsTargets } from "./colekaPrices";

describe("colekaCarddassDealsTargets", () => {
  it("covers FR s1–s5, s6 IT, s24, s28, rampage, US promos, s27 — never umbrellas", () => {
    const ids = colekaCarddassDealsTargets().map((t) => t.rubriqueId);
    expect(ids).toEqual([
      "4108",
      "4109",
      "4110",
      "4111",
      "4112",
      "41388",
      "15466",
      "16649",
      "16963",
      "38199",
      "36959",
    ]);
    expect(ids).not.toContain("4102");
    expect(ids).not.toContain("41705");
  });

  it("resolves Carddass NI-232 and EU NI-1650 to different printKeys", () => {
    const targets = colekaCarddassDealsTargets();
    const s1 = targets.find((t) => t.rubriqueId === "4108")!;
    const s24 = targets.find((t) => t.rubriqueId === "15466")!;
    const s27 = targets.find((t) => t.rubriqueId === "36959")!;
    expect(
      s1.resolvePrintKey({
        colekaId: "1",
        rubriqueId: "4108",
        refItem: "NI-232",
        title: null,
        quotationEuro: null,
        offerEuro: null,
        shippingEuro: null,
        marketplace: null,
        externalId: null,
        observedAt: null,
        affiliatePath: null,
      }),
    ).toBe("naruto:ni-0232");
    expect(
      s24.resolvePrintKey({
        colekaId: "2",
        rubriqueId: "15466",
        refItem: "NI-1650",
        title: null,
        quotationEuro: null,
        offerEuro: null,
        shippingEuro: null,
        marketplace: null,
        externalId: null,
        observedAt: null,
        affiliatePath: null,
      }),
    ).toBe("naruto:n-1650");
    expect(
      s27.resolvePrintKey({
        colekaId: "3",
        rubriqueId: "36959",
        refItem: "J 986",
        title: "Rasengan",
        quotationEuro: null,
        offerEuro: null,
        shippingEuro: null,
        marketplace: null,
        externalId: null,
        observedAt: null,
        affiliatePath: null,
      }),
    ).toBe("naruto:j-0986");
  });
});
