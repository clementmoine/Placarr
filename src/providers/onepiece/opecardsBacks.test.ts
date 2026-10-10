import { describe, expect, it } from "vitest";

import { opecardsBackUrl } from "./opecardsBacks";

describe("opecardsBackUrl", () => {
  it("maps DON stamp slug to CDN back-don!!.webp", () => {
    expect(opecardsBackUrl("don")).toBe(
      "https://static.opecards.fr/cards/common/back-don!!.webp",
    );
  });

  it("keeps plain category segments", () => {
    expect(opecardsBackUrl("leader")).toBe(
      "https://static.opecards.fr/cards/common/back-leader.webp",
    );
    expect(opecardsBackUrl("character")).toBe(
      "https://static.opecards.fr/cards/common/back-character.webp",
    );
  });
});
