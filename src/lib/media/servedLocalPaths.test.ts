import { describe, expect, it } from "vitest";

import { isServedLocalPath } from "./servedLocalPaths";

/**
 * Regression: the item form only accepted `/uploads/`, so editing a card whose
 * face is served from a local pack failed validation on the hidden "Affiche"
 * tab. No error was visible and no request was sent — Enregistrer did nothing.
 */
describe("isServedLocalPath", () => {
  it("accepts both roots this app serves", () => {
    expect(isServedLocalPath("/uploads/abc.jpg")).toBe(true);
    expect(
      isServedLocalPath("/assets/naruto/carddass/cards/s4/fr/ta158/art.jpg"),
    ).toBe(true);
  });

  it("rejects a path that escaped its host, which points at nothing", () => {
    expect(isServedLocalPath("/images/card.jpg")).toBe(false);
    expect(isServedLocalPath("https://example.test/card.jpg")).toBe(false);
  });
});
