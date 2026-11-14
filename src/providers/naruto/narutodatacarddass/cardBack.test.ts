import { describe, expect, it } from "vitest";

import {
  dataCarddassBackSetFromPrint,
  resolveDataCarddassCardBack,
} from "./cardBack";

describe("dataCarddassBackSetFromPrint", () => {
  it("maps DN/DT/NM printKeys to curated sleeves", () => {
    expect(
      dataCarddassBackSetFromPrint({ printKey: "datacarddass:dn-029t" }),
    ).toBe("dn");
    expect(
      dataCarddassBackSetFromPrint({ printKey: "datacarddass:dt-001" }),
    ).toBe("dn");
    expect(
      dataCarddassBackSetFromPrint({ printKey: "datacarddass:nm-125" }),
    ).toBe("nm");
    expect(
      dataCarddassBackSetFromPrint({ printKey: "datacarddass:nf-058" }),
    ).toBeNull();
  });
});

describe("resolveDataCarddassCardBack", () => {
  it("returns set role URLs for DN and NM", () => {
    expect(
      resolveDataCarddassCardBack({ printKey: "datacarddass:dn-029t" }),
    ).toBe("/assets/naruto/data-carddass/backs/ja/sets/dn");
    expect(
      resolveDataCarddassCardBack({ setCode: "nm" }),
    ).toBe("/assets/naruto/data-carddass/backs/ja/sets/nm");
  });
});
