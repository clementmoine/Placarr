import { describe, expect, it } from "vitest";

import { pokecardexScanLocalId, pokecardexScanUrl } from "./scanUrl";

describe("pokecardexScanUrl", () => {
  it("builds unpadded FR/US original scan URLs", () => {
    expect(
      pokecardexScanUrl({ seriesCode: "M23", zone: "FR", localId: 1 }),
    ).toBe(
      "https://pokecardex-scans.b-cdn.net/sets/M23/FR/1.jpg?class=original",
    );
    expect(
      pokecardexScanUrl({ seriesCode: "m24", zone: "US", localId: "015" }),
    ).toBe(
      "https://pokecardex-scans.b-cdn.net/sets/M24/US/15.jpg?class=original",
    );
  });

  it("strips leading zeros and honours image class", () => {
    expect(
      pokecardexScanUrl({
        seriesCode: "M23",
        zone: "FR",
        localId: "001",
        imageClass: "hd",
      }),
    ).toBe("https://pokecardex-scans.b-cdn.net/sets/M23/FR/1.jpg?class=hd");
  });

  it("maps Black Star promo collector ids to bare decimals", () => {
    expect(pokecardexScanLocalId("SM01")).toBe("1");
    expect(pokecardexScanLocalId("SM100")).toBe("100");
    expect(
      pokecardexScanUrl({
        seriesCode: "PRSM",
        zone: "FR",
        localId: "SM01",
      }),
    ).toBe(
      "https://pokecardex-scans.b-cdn.net/sets/PRSM/FR/1.jpg?class=original",
    );
  });
});
