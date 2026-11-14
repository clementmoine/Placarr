import { describe, expect, it } from "vitest";

import { pickLatestCdxRow } from "./cdx";

describe("pickLatestCdxRow", () => {
  it("returns the newest timestamp", () => {
    expect(
      pickLatestCdxRow([
        ["20200101000000", "https://a.example/1.jpg"],
        ["20230101000000", "https://a.example/2.jpg"],
        ["20210101000000", "https://a.example/3.jpg"],
      ]),
    ).toEqual({
      timestamp: "20230101000000",
      original: "https://a.example/2.jpg",
    });
  });

  it("skips incomplete rows", () => {
    expect(pickLatestCdxRow([["20200101000000"], []])).toBeNull();
    expect(
      pickLatestCdxRow([["", "https://a.example/x.jpg"]]),
    ).toBeNull();
  });
});
