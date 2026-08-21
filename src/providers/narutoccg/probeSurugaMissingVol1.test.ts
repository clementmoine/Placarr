import { describe, expect, it } from "vitest";

import { carddasJpCardlistCards } from "./parseCarddasJpCardlist";

describe("probeSurugaMissingVol1 targets", () => {
  it("vol1 checklist includes 忍-3 as ni0003", () => {
    const row = carddasJpCardlistCards().find((c) => c.printed === "忍-3");
    expect(row).toMatchObject({ number: "ni0003", setCode: "maki1" });
  });
});
