import { describe, expect, it } from "vitest";

import { buildBleachFrLedger } from "./carddassFr";

describe("bleachscb parseCarddassFr", () => {
  it("builds FR ledger from Wayback scout + liste HTML when present", () => {
    const { cards } = buildBleachFrLedger();
    // Staging fixtures live in-repo under data/staging/carddass-wayback-scout.
    expect(cards.length).toBeGreaterThan(50);
    const a001 = cards.find((c) => c.printed === "A001");
    expect(a001?.faceUrlFr).toMatch(/web\.archive\.org/);
    expect(a001?.nameFr).toMatch(/Ichigo/i);
    expect(a001?.set).toBe("a");
  });
});
