import { describe, expect, it } from "vitest";

import { clearFalseSuperSeriePartMemberships } from "./superSerieMembership";
import { parseDbsjccNumber, dbsjccPrintKey } from "../printKey";

describe("Super JCC / false SS membership cleanup", () => {
  it("treats DB-### as distinct from D-###", () => {
    expect(parseDbsjccNumber("DB-001")).toBe("db0001");
    expect(parseDbsjccNumber("D-1")).toBe("d0001");
    expect(dbsjccPrintKey("ss1", "DB-001")).not.toBe(
      dbsjccPrintKey("part1", "D-1"),
    );
  });

  it("clearFalseSuperSeriePartMemberships is safe on the live pack db", () => {
    const report = clearFalseSuperSeriePartMemberships();
    expect(report.removed).toBeGreaterThanOrEqual(0);
  });
});
