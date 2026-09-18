import { describe, expect, it } from "vitest";

import { pokecardexScanUrl } from "./scanUrl";

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
});
