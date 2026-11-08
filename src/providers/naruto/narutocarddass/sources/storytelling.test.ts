import { describe, expect, it } from "vitest";

import { sanitizePublicCitationUrl } from "@/core/enrich/citations/publicCitationUrl";

import {
  listNarutoStorytellingEntries,
  narutoEditorialStoryEntryForPrint,
  narutoEditorialStoryEntryForSealedSlug,
  resetNarutoStorytellingCache,
} from "./storytelling";

describe("naruto storytelling ledger", () => {
  resetNarutoStorytellingCache();

  it("loads editorial Carddass stories with openable sources", () => {
    const entries = listNarutoStorytellingEntries();
    expect(entries.length).toBeGreaterThanOrEqual(8);
    for (const entry of entries) {
      expect(entry.bodyFr.length).toBeGreaterThan(80);
      expect(entry.sources.length).toBeGreaterThan(0);
      for (const src of entry.sources) {
        expect(sanitizePublicCitationUrl(src.url)).toBe(src.url);
      }
    }
  });

  it("resolves booster-s28 and PR-096 targets", () => {
    const sealed = narutoEditorialStoryEntryForSealedSlug("booster-s28");
    expect(sealed?.id).toBe("booster-s28-eu-eight");
    expect(sealed?.bodyFr).toMatch(/8 CARTES/);
    expect(sealed?.bodyFr).toContain("[[sealed:booster-s28|");

    const print = narutoEditorialStoryEntryForPrint({
      number: "pr096",
      printKey: "naruto:pr-0096",
    });
    expect(print?.id).toBe("duopack-s28-window-pr096");
  });
});
