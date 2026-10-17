import { describe, expect, it } from "vitest";

import { labelFromPrintSetOptions } from "./labelPrintSet";

describe("labelFromPrintSetOptions", () => {
  it("returns the player label for a known set id", () => {
    expect(
      labelFromPrintSetOptions(
        [
          { id: "gaku", label: "忍伝-学 (série école)" },
          { id: "1", label: "Premier Chapitre" },
        ],
        "gaku",
      ),
    ).toBe("忍伝-学 (série école)");
    expect(
      labelFromPrintSetOptions(
        [{ id: "sv03.5", label: "151" }],
        "SV03.5",
      ),
    ).toBe("151");
  });

  it("falls back to the raw code when the set is unknown", () => {
    expect(labelFromPrintSetOptions([], "swsh3")).toBe("swsh3");
    expect(labelFromPrintSetOptions([{ id: "1", label: "A" }], "")).toBeNull();
  });
});
