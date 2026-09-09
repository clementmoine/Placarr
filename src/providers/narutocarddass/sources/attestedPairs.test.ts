import { describe, expect, it } from "vitest";

import { narutoAttestedPairOf, narutoIsAttestedPair } from "./attestedPairs";

describe("narutoAttestedPairs", () => {
  it("links named pairs without treating every NI as an N", () => {
    expect(narutoIsAttestedPair("ni0001", "n0001")).toBe(true);
    expect(narutoIsAttestedPair("ni001", "N-001")).toBe(true);
    expect(narutoAttestedPairOf("ta081")).toBe("m0081");
    expect(narutoIsAttestedPair("ni232", "n232")).toBe(false);
  });
});
