import { describe, expect, it } from "vitest";

import type { PrintCandidate } from "@/types/providerModule";

import { enumerateSetPrints } from "./setPrints";

function print(
  overrides: Partial<PrintCandidate> &
    Pick<PrintCandidate, "printKey" | "title">,
): PrintCandidate {
  return {
    reference: overrides.reference ?? overrides.printKey,
    language: overrides.language ?? "fr",
    ...overrides,
  };
}

describe("enumerateSetPrints", () => {
  it("keeps one row per printKey after language filter (multi-title JOIN)", async () => {
    const rows = await enumerateSetPrints({
      setId: "Q3",
      language: "fr",
      search: async () => [
        print({
          printKey: "lorcana:q3-10",
          title: "Brute de ronces - Protège la tige",
          language: "fr",
          reference: "10/37",
        }),
        print({
          printKey: "lorcana:q3-10",
          title: "BRAMBLE BULLY - Protecting the Stalk",
          language: "de",
          reference: "10/37",
        }),
        print({
          printKey: "lorcana:q3-11",
          title: "Germe de la Plante - Tranchante",
          language: "fr",
          reference: "11/37",
        }),
      ],
    });
    expect(rows.map((row) => [row.printKey, row.title])).toEqual([
      ["lorcana:q3-10", "Brute de ronces - Protège la tige"],
      ["lorcana:q3-11", "Germe de la Plante - Tranchante"],
    ]);
  });

  it("drops other-language rows before collapsing", async () => {
    const rows = await enumerateSetPrints({
      setId: "Q3",
      language: "fr",
      search: async () => [
        print({
          printKey: "lorcana:q3-10",
          title: "BRAMBLE BULLY - Protecting the Stalk",
          language: "de",
        }),
        print({
          printKey: "lorcana:q3-10",
          title: "Brute de ronces - Protège la tige",
          language: "fr",
        }),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Brute de ronces - Protège la tige");
  });
});
