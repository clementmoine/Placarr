import { describe, expect, it } from "vitest";

import {
  VARIANT_OPTION_FACT_KIND,
  offersVariantChoice,
  resolveStoredVariant,
  variantOptionsFromFacts,
} from "./variants";

function option(value: string) {
  return { kind: VARIANT_OPTION_FACT_KIND, value };
}

describe("variantOptionsFromFacts", () => {
  it("collects the declared variants in provider order", () => {
    expect(
      variantOptionsFromFacts([
        { kind: "tag", value: "Personnage" },
        option("None"),
        option("Silver"),
        { kind: "rarity", value: "Rare" },
      ]),
    ).toEqual(["None", "Silver"]);
  });

  it("reads the kind, never the label", () => {
    // A localized label must not be what makes a fact machine-readable.
    expect(
      variantOptionsFromFacts([
        { kind: "tag", value: "None • Silver" },
        { kind: "tag", value: "Finitions existantes" },
      ]),
    ).toEqual([]);
  });

  it("offers one choice when two providers name the same finish", () => {
    expect(
      variantOptionsFromFacts([option("Foil"), option("foil"), option("FOIL")]),
    ).toEqual(["Foil"]);
  });

  it("ignores blank values rather than offering an empty choice", () => {
    expect(
      variantOptionsFromFacts([option("  "), option("Silver"), option("")]),
    ).toEqual(["Silver"]);
  });

  it("survives missing facts", () => {
    expect(variantOptionsFromFacts(null)).toEqual([]);
    expect(variantOptionsFromFacts(undefined)).toEqual([]);
    expect(variantOptionsFromFacts([])).toEqual([]);
  });
});

describe("offersVariantChoice", () => {
  it("is false for a single option, which is not a choice", () => {
    // An Enchanted card exists only in Magma foil: asking says nothing.
    expect(offersVariantChoice([option("Magma")])).toBe(false);
  });

  it("is true once there is something to pick between", () => {
    expect(offersVariantChoice([option("None"), option("Silver")])).toBe(true);
  });

  it("is false without options", () => {
    expect(offersVariantChoice([{ kind: "tag", value: "Rare" }])).toBe(false);
  });
});

describe("resolveStoredVariant", () => {
  it("keeps a variant the metadata still declares", () => {
    expect(
      resolveStoredVariant("Silver", [option("None"), option("Silver")]),
    ).toBe("Silver");
  });

  it("matches case-insensitively but answers with the declared spelling", () => {
    expect(resolveStoredVariant("silver", [option("Silver")])).toBe("Silver");
  });

  it("drops a variant the metadata no longer declares", () => {
    // Guessing a replacement would quietly relabel someone's copy.
    expect(resolveStoredVariant("Silver", [option("None")])).toBeNull();
  });

  it("drops everything when nothing is declared", () => {
    expect(resolveStoredVariant("Silver", [])).toBeNull();
    expect(resolveStoredVariant("Silver", null)).toBeNull();
  });

  it("treats blank as absent", () => {
    expect(resolveStoredVariant("  ", [option("None")])).toBeNull();
    expect(resolveStoredVariant(null, [option("None")])).toBeNull();
  });
});
