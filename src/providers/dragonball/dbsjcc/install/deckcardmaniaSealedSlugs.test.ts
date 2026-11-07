import { describe, expect, it } from "vitest";

import {
  primaryBoosterSlugForSet,
  sealedSlugFromDeckcardmaniaGalleryTitle,
} from "./deckcardmaniaSealedSlugs";

describe("sealedSlugFromDeckcardmaniaGalleryTitle", () => {
  it("maps titled decks on Série 5 (Planète / Résistance)", () => {
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part5", "Deck Planète"),
    ).toBe("part5-starter-1203");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part5", "Deck Résistance"),
    ).toBe("part5-starter-resistance");
  });

  it("maps titled decks on Série 4 (Vaincre / Force du Mal)", () => {
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle(
        "part4",
        "Deck Vaincre la Menace",
      ),
    ).toBe("part4-starter-1200");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part4", "Deck Force du Mal"),
    ).toBe("part4-starter-forces-du-mal");
  });

  it("rejects liste / dos / exemples / card samples", () => {
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part5", "Liste des Cartes"),
    ).toBeNull();
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part1", "Dos de cards"),
    ).toBeNull();
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part5", "Exemple de carte"),
    ).toBeNull();
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part10", "Cartes N°: D 874-1"),
    ).toBeNull();
  });

  it("rejects deck captions that do not match the album set", () => {
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part4", "Deck Planète"),
    ).toBeNull();
  });

  it("maps booster captions to the primary booster slug when present on disk", () => {
    const slug = sealedSlugFromDeckcardmaniaGalleryTitle(
      "part5",
      "Booster de 8 cartes",
    );
    // Live data tree — primary S5 booster exists.
    expect(slug).toBe("part5-booster-1202");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part2", "Booster"),
    ).toBe("part2-booster-1192");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part6", "Pochette"),
    ).toBe("part6-booster-1205");
  });
});

describe("primaryBoosterSlugForSet", () => {
  it("skips booster-box dirs", () => {
    expect(primaryBoosterSlugForSet("part5")).toBe("part5-booster-1202");
    expect(primaryBoosterSlugForSet("part1")).toBe("part1-booster-1188");
  });
});

describe("Super Série / Tin box captions", () => {
  it("rejects non-corpus setHints still", () => {
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle(null, "Booster de 8 cartes"),
    ).toBeNull();
  });

  it("maps titled dual decks only within their set", () => {
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("ss5", "Deck Planète"),
    ).toBeNull();
  });

  it("maps « Deck de 32 cartes » on SS5 → ss5-starter (DCM 247_i2b)", () => {
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("ss5", "Deck de 32 cartes"),
    ).toBe("ss5-starter");
  });

  it("maps S4/S5 dual deck + S6–10 named deck captions", () => {
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle(
        "part4",
        "Deck Vaincre la Menace",
      ),
    ).toBe("part4-starter-1200");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part4", "Deck Force du Mal"),
    ).toBe("part4-starter-forces-du-mal");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part5", "Deck Planète"),
    ).toBe("part5-starter-1203");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part5", "Deck Résistance"),
    ).toBe("part5-starter-resistance");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part6", "Deck Fusion"),
    ).toBe("part6-starter-1206");
    expect(
      sealedSlugFromDeckcardmaniaGalleryTitle("part9", "Deck Heros"),
    ).toBe("part9-starter-1216");
  });
});
