import { afterEach, describe, expect, it } from "vitest";

import {
  filterBarcodeLookupTasksForRecord,
  isBarcodeRecordSlimMode,
} from "./recordMode";

describe("barcode recordMode", () => {
  afterEach(() => {
    delete process.env.BARCODE_RECORD_SLIM;
  });

  it("is off by default", () => {
    expect(isBarcodeRecordSlimMode()).toBe(false);
  });

  it("filters slow scrape providers during slim record", () => {
    process.env.BARCODE_RECORD_SLIM = "1";
    const tasks = {
      pc: Promise.resolve(null),
      picclick: Promise.resolve([]),
      leDenicheur: Promise.resolve(null),
      amc: Promise.resolve([]),
    };

    expect(filterBarcodeLookupTasksForRecord(tasks)).toEqual({
      pc: tasks.pc,
      amc: tasks.amc,
    });
  });
});
