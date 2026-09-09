import { describe, expect, it } from "vitest";

import {
  copyGroupKey,
  groupCopies,
  withoutCopyMarker,
  type GroupableCopy,
} from "./groupCopies";

const copy = (
  over: Partial<GroupableCopy> & { id: string },
): GroupableCopy => ({
  metadataId: "m1",
  ...over,
});

describe("copyGroupKey", () => {
  it("puts two copies of the same print together", () => {
    expect(copyGroupKey(copy({ id: "a" }))).toBe(
      copyGroupKey(copy({ id: "b" })),
    );
  });

  it("keeps a foil copy apart from a plain one", () => {
    // Different objects: priced differently, collected separately.
    expect(copyGroupKey(copy({ id: "a", variant: "Silver" }))).not.toBe(
      copyGroupKey(copy({ id: "b", variant: null })),
    );
  });

  it("ignores condition, which is health rather than identity", () => {
    // A mint card gets played. If condition split groups, a collector could
    // never be told "you have 3 Elsa" — which is the point of grouping.
    expect(copyGroupKey(copy({ id: "a", condition: "new" }))).toBe(
      copyGroupKey(copy({ id: "b", condition: "damaged" })),
    );
  });

  it("treats a variant as the same however it was typed", () => {
    expect(copyGroupKey(copy({ id: "a", variant: "Silver" }))).toBe(
      copyGroupKey(copy({ id: "b", variant: " silver " })),
    );
  });

  it("leaves unidentified copies apart rather than heaping them together", () => {
    // Two items nothing is known about are not evidence of owning two of
    // anything, so they must not merge into one anonymous tile.
    expect(copyGroupKey({ id: "a", metadataId: null })).not.toBe(
      copyGroupKey({ id: "b", metadataId: null }),
    );
  });
});

describe("groupCopies", () => {
  it("counts the copies behind one lead", () => {
    const groups = groupCopies([
      copy({ id: "a" }),
      copy({ id: "b" }),
      copy({ id: "c" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.lead.id).toBe("a");
    expect(groups[0]!.copies.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the order it was given, groups where their first copy stood", () => {
    // The caller has already sorted; regrouping must not quietly reorder a shelf.
    const groups = groupCopies([
      copy({ id: "elsa1", metadataId: "elsa" }),
      copy({ id: "pumbaa", metadataId: "pumbaa" }),
      copy({ id: "elsa2", metadataId: "elsa" }),
    ]);
    expect(groups.map((g) => g.lead.id)).toEqual(["elsa1", "pumbaa"]);
    expect(groups[0]!.copies).toHaveLength(2);
  });

  it("separates the finishes of one card into their own tiles", () => {
    const groups = groupCopies([
      copy({ id: "a", variant: "Silver" }),
      copy({ id: "b", variant: null }),
      copy({ id: "c", variant: "Silver" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.copies).toHaveLength(2);
    expect(groups[1]!.copies).toHaveLength(1);
  });

  it("has nothing to say about an empty shelf", () => {
    expect(groupCopies([])).toEqual([]);
  });
});

describe("withoutCopyMarker", () => {
  it("drops the marker a duplicate carried in its title", () => {
    // Once the tile says ×3, repeating it is noise.
    expect(withoutCopyMarker("Elsa (copie)")).toBe("Elsa");
    expect(withoutCopyMarker("Elsa (copie 2)")).toBe("Elsa");
    expect(withoutCopyMarker("Elsa (copy)")).toBe("Elsa");
  });

  it("leaves a title that merely ends in brackets alone", () => {
    // A parenthetical is part of plenty of real names.
    expect(withoutCopyMarker("Elsa (Esprit de l'hiver)")).toBe(
      "Elsa (Esprit de l'hiver)",
    );
    expect(withoutCopyMarker("Zelda (Collector)")).toBe("Zelda (Collector)");
  });

  it("survives an absent name", () => {
    expect(withoutCopyMarker(null)).toBe("");
    expect(withoutCopyMarker(undefined)).toBe("");
  });
});
