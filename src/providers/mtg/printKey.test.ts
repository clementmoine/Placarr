import { describe, expect, it } from "vitest";

import {
  formatMtgReference,
  mtgPrintKey,
  sanitizeMtgCollector,
} from "./printKey";

describe("mtg printKey", () => {
  it("builds set + collector", () => {
    expect(mtgPrintKey("MH3", "1")).toBe("mtg:mh3-1");
    expect(mtgPrintKey("one", "128a")).toBe("mtg:one-128a");
  });

  it("sanitizes star / dagger collectors", () => {
    expect(sanitizeMtgCollector("128★")).toBe("128s");
    expect(sanitizeMtgCollector("7†")).toBe("7t");
    expect(mtgPrintKey("lea", "232★")).toBe("mtg:lea-232s");
  });

  it("rejects empty segments", () => {
    expect(mtgPrintKey("", "1")).toBeNull();
    expect(mtgPrintKey("mh3", "")).toBeNull();
  });

  it("formats reference for UI", () => {
    expect(formatMtgReference("mh3", "1")).toBe("MH3 · 1");
  });
});
