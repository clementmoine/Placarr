import { describe, expect, it } from "vitest";

import {
  entryHasFoil,
  langFilesHaveFoil,
} from "@/lib/admin/catalogueCards";
import {
  resolveCataloguePackId,
  resolveCatalogueScope,
  cataloguePackInfo,
} from "@/lib/admin/cataloguePacks";

describe("cataloguePacks", () => {
  it("resolves pack ids and aliases", () => {
    expect(resolveCataloguePackId("pokemon")).toBe("pokemon");
    expect(resolveCataloguePackId("carddass")).toBe("naruto/ccg");
    expect(resolveCataloguePackId("naruto")).toBe("naruto/ccg");
    expect(resolveCataloguePackId("ccg")).toBe("naruto/ccg");
    expect(resolveCataloguePackId("nope")).toBeNull();
  });

  it("forces all scope when pack has no foil effects", () => {
    const naruto = cataloguePackInfo("naruto/ccg")!;
    expect(resolveCatalogueScope("foils", naruto)).toBe("all");
    expect(resolveCatalogueScope(null, naruto)).toBe("all");
  });

  it("defaults pokemon/lorcana to foils", () => {
    const pokemon = cataloguePackInfo("pokemon")!;
    expect(resolveCatalogueScope(null, pokemon)).toBe("foils");
    expect(resolveCatalogueScope("all", pokemon)).toBe("all");
  });
});

describe("catalogueCards foil detection", () => {
  it("detects mask / etch / variant foil assets", () => {
    expect(langFilesHaveFoil({ art: "art.webp" })).toBe(false);
    expect(langFilesHaveFoil({ art: "art.webp", mask: "mask.webp" })).toBe(
      true,
    );
    expect(
      langFilesHaveFoil({
        art: "art.webp",
        variants: { ph: { mask: "mask-ph.webp" } },
      }),
    ).toBe(true);
    expect(
      entryHasFoil({
        set: "s1",
        card: "001",
        langs: { fr: { art: "art.jpg" }, en: { art: "a.webp", etch: "e.webp" } },
      }),
    ).toBe(true);
  });
});
