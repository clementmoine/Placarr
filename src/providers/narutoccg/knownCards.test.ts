import { describe, expect, it } from "vitest";

import {
  isUnpublishedHtmlRef,
  PHYSICAL_KNOWN_SOURCES,
  type KnownSource,
} from "./knownCards";

describe("isUnpublishedHtmlRef", () => {
  it("flags lone carddass-html as unpublished (ta090-class)", () => {
    expect(isUnpublishedHtmlRef(["carddass-html"])).toBe(true);
  });

  it("does not flag empty or multi-source rows", () => {
    expect(isUnpublishedHtmlRef([])).toBe(false);
    expect(
      isUnpublishedHtmlRef(["carddass-html", "carddass-fr-checklist"]),
    ).toBe(false);
    expect(isUnpublishedHtmlRef(["manga-news"])).toBe(false);
  });

  it("physical sources alone are not unpublished-html", () => {
    for (const source of PHYSICAL_KNOWN_SOURCES) {
      expect(isUnpublishedHtmlRef([source as KnownSource])).toBe(false);
    }
  });
});
