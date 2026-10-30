import { describe, expect, it } from "vitest";

import { catalogRefreshOptsFromPayload } from "./catalogRefreshOpts";

describe("catalogRefreshOptsFromPayload", () => {
  it("parses CSV and arrays", () => {
    expect(
      catalogRefreshOptsFromPayload({
        only: "faces,products",
        langs: ["FR", "en"],
        limit: "12",
        auto: true,
      }),
    ).toEqual({
      auto: true,
      only: ["faces", "products"],
      langs: ["FR", "en"],
      limit: 12,
    });
  });

  it("drops empty / invalid fields", () => {
    expect(
      catalogRefreshOptsFromPayload({
        only: "  ",
        limit: 0,
        skip: [],
      }),
    ).toEqual({ auto: false });
  });
});
