import { describe, expect, it } from "vitest";

import { resolveNarutoLocalePrinted } from "./printedLocale";

describe("resolveNarutoLocalePrinted", () => {
  it("keeps S2/S5 FR retail printed even when the number also has an S6 twin", () => {
    // Fan-out used to copy S6 printed:false onto these siblings.
    expect(
      resolveNarutoLocalePrinted({
        setCode: "s2",
        lang: "fr",
        number: "ni0103",
      }),
    ).toBe(true);
    expect(
      resolveNarutoLocalePrinted({
        setCode: "s5",
        lang: "fr",
        number: "ni0243",
      }),
    ).toBe(true);
  });

  it("marks attested S6 FR inserts printed and cancelled retail S6 unprinted", () => {
    expect(
      resolveNarutoLocalePrinted({
        setCode: "s6",
        lang: "fr",
        number: "ni0103",
      }),
    ).toBe(true); // MIJ reprint ledger
    expect(
      resolveNarutoLocalePrinted({
        setCode: "s6",
        lang: "fr",
        number: "ni0236",
      }),
    ).toBe(true); // Kana/DVD inédite
    expect(
      resolveNarutoLocalePrinted({
        setCode: "s6",
        lang: "fr",
        number: "ni0267",
      }),
    ).toBe(false); // cancelled retail / preprod only
  });

  it("flags FR HTML phantoms unprinted on their paper serie", () => {
    expect(
      resolveNarutoLocalePrinted({
        setCode: "s2",
        lang: "fr",
        number: "ta0090",
      }),
    ).toBe(false);
  });
});
