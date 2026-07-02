import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildBarcodeRecordEnrichmentDeps,
  filterBarcodeLookupTasksForRecord,
  isBarcodeRecordSlimMode,
  resolveBarcodeLookupTasks,
} from "./recordMode";

describe("barcode recordMode", () => {
  afterEach(() => {
    delete process.env.BARCODE_RECORD_SLIM;
    delete process.env.RECORD;
  });

  it("is off by default", () => {
    expect(isBarcodeRecordSlimMode()).toBe(false);
  });

  it("filters slow barcode lookup keys during slim record", () => {
    process.env.BARCODE_RECORD_SLIM = "1";
    const tasks = {
      pc: Promise.resolve(null),
      ebay: Promise.resolve([]),
      leDenicheur: Promise.resolve(null),
      cal: Promise.resolve([]),
      freakxy: Promise.resolve([]),
      amc: Promise.resolve([]),
    };

    expect(filterBarcodeLookupTasksForRecord(tasks)).toEqual({
      pc: tasks.pc,
      ebay: tasks.ebay,
      amc: tasks.amc,
    });
  });

  it("skips post-scan enrich during slim record", () => {
    process.env.BARCODE_RECORD_SLIM = "1";
    const deps = buildBarcodeRecordEnrichmentDeps();
    expect(deps?.fetchReferencePriceByBarcode).toBeUndefined();
    expect(deps?.fetchGameMediaByBarcode).toBeUndefined();
  });

  it("omits slow barcode lookup modules before tasks are built", async () => {
    process.env.BARCODE_RECORD_SLIM = "1";
    const { createBarcodeLookupTaskBuilders } = await import(
      "@/services/provider/barcode"
    );
    const leDenicheurStarted = vi.fn(() => Promise.resolve(null));
    const pcStarted = vi.fn(() => Promise.resolve(null));
    const builders = createBarcodeLookupTaskBuilders(
      new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "fetchPricesFromLeDenicheur") return leDenicheurStarted;
            if (prop === "fetchMetadataFromPriceCharting") return pcStarted;
            return () => Promise.resolve(null);
          },
        },
      ) as never,
    );
    const tasks = builders.games({ barcode: "0045496365226" });
    expect(tasks).not.toHaveProperty("leDenicheur");
    expect(tasks).toHaveProperty("pc");
    await Promise.allSettled(Object.values(tasks));
    expect(leDenicheurStarted).not.toHaveBeenCalled();
    expect(pcStarted).toHaveBeenCalled();
  });

  it("logs per-provider timings during RECORD", async () => {
    process.env.RECORD = "1";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await resolveBarcodeLookupTasks({
      fast: Promise.resolve("ok"),
      slow: new Promise((resolve) => setTimeout(() => resolve("slow"), 5)),
    });
    expect(log.mock.calls.some(([line]) => String(line).includes("[record lookup] fast"))).toBe(true);
    log.mockRestore();
  });
});
