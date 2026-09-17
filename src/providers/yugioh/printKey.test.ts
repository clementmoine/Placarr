import { describe, expect, it } from "vitest";

import {
  formatYugiohReference,
  parseYugiohPrintedCode,
  yugiohPrintKey,
} from "./printKey";

describe("yugioh printKey", () => {
  it("parses ScanFlip / TCG printed codes", () => {
    expect(parseYugiohPrintedCode("LDD-F000")).toEqual({
      set: "ldd",
      number: "f000",
      printed: "LDD-F000",
    });
    expect(parseYugiohPrintedCode("TP1-F001")).toEqual({
      set: "tp1",
      number: "f001",
      printed: "TP1-F001",
    });
    expect(parseYugiohPrintedCode("ABPF-FRSE1")).toEqual({
      set: "abpf",
      number: "frse1",
      printed: "ABPF-FRSE1",
    });
    expect(yugiohPrintKey("ldd", "f000")).toBe("yugioh:ldd-f000");
    expect(formatYugiohReference("ldd", "f000")).toBe("LDD-F000");
  });
});
