import { describe, expect, it } from "vitest";

import { NARUTO_PACK_ID } from "@/providers/naruto/narutocarddass/packs";
import { resetNarutoDigCitationCaches } from "@/providers/naruto/narutocarddass/sources/digCitations";

import { listPackStorytelling } from "./packStorytelling";

describe("listPackStorytelling", () => {
  resetNarutoDigCitationCaches();

  it("returns editorial Carddass rows with sources", () => {
    const rows = listPackStorytelling(NARUTO_PACK_ID);
    const editorial = rows.filter((r) => r.status === "editorial");
    expect(editorial.length).toBeGreaterThanOrEqual(8);
    expect(editorial.some((r) => r.id === "booster-s28-eu-eight")).toBe(true);
    expect(editorial[0]?.sources[0]?.url).toMatch(/^https?:\/\//);
  });

  it("filters by q", () => {
    const hit = listPackStorytelling(NARUTO_PACK_ID, { q: "Storm 3" });
    expect(hit.some((r) => /s28|Storm/i.test(r.plainText + r.id))).toBe(true);
  });

  it("returns empty for unknown pack", () => {
    expect(listPackStorytelling("pokemon/tcgdex")).toEqual([]);
  });
});
