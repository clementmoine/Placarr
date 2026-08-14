import { describe, expect, it } from "vitest";

import {
  dbscardsFaceUrls,
  dbscardsNameSlug,
  dbscardsRarityCode,
  dbscardsSlugs,
} from "./dbscardsFaces";

describe("dbscardsNameSlug", () => {
  it("folds accents the way their slugs spell them", () => {
    expect(dbscardsNameSlug("Vados, Déesse de la fascination")).toBe(
      "vados-deesse-de-la-fascination",
    );
  });

  it("expands ligatures instead of dropping them", () => {
    // NFKD alone turns `cœur` into `cur`, which missed the file entirely.
    expect(dbscardsNameSlug("Vados au cœur calme")).toBe(
      "vados-au-coeur-calme",
    );
  });

  it("spells an apostrophe both ways, because the corpus does", () => {
    expect(dbscardsNameSlug("Vados l’assistante")).toBe("vados-lassistante");
    expect(
      dbscardsNameSlug("Freezer, de retour de l’Enfer", {
        apostropheAsSeparator: true,
      }),
    ).toBe("freezer-de-retour-de-l-enfer");
  });
});

describe("dbscardsRarityCode", () => {
  it("takes the bracketed letters, which is what the slug carries", () => {
    expect(dbscardsRarityCode("Super Rare[SR]")).toBe("sr");
    expect(dbscardsRarityCode("Uncommon[UC]")).toBe("uc");
  });

  it("yields nothing rather than guessing when unbracketed", () => {
    expect(dbscardsRarityCode("Promo")).toBe("");
    expect(dbscardsRarityCode(null)).toBe("");
  });
});

describe("dbscardsSlugs", () => {
  it("files a Leader under its awakened name, not its front name", () => {
    // `bt1-001` is Champa on the front; their slug is the awakened side.
    expect(
      dbscardsSlugs({
        setCode: "bt1",
        number: "001",
        rarity: "Rare[R]",
        fullName: "Champa",
        awakenedName: "Champa, Dieu de la destruction",
      })[0],
    ).toBe("bt1-001-r-champa-dieu-de-la-destruction");
  });

  it("falls back to the printed name when there is no awakened side", () => {
    expect(
      dbscardsSlugs({
        setCode: "bt1",
        number: "006",
        rarity: "Common[C]",
        fullName: "Champa complotant",
      })[0],
    ).toBe("bt1-006-c-champa-complotant");
  });
});

describe("dbscardsFaceUrls", () => {
  it("offers both CDN layouts, since neither covers the whole corpus", () => {
    const urls = dbscardsFaceUrls({
      setCode: "bt3",
      number: "094",
      rarity: "Common[C]",
      fullName: "Vegeta",
    });
    expect(urls[0]).toContain("/cards/fr/bt3/image-cartes-a-collectionner-");
    // The legacy path really is spelled with one `n` — not a typo here.
    expect(urls[1]).toContain("/cards/original/image-cartes-a-collectioner-");
    expect(urls[1]).toContain("bt3-094-c-vegeta.webp");
  });

  it("asks for the awakened side on request", () => {
    const urls = dbscardsFaceUrls(
      {
        setCode: "bt1",
        number: "001",
        rarity: "Rare[R]",
        fullName: "Champa",
        awakenedName: "Champa, Dieu de la destruction",
      },
      { face: "back" },
    );
    expect(urls[0]).toContain("-champa-dieu-de-la-destruction-back.webp");
  });
});

/**
 * The English column held zero dbscards files while the log showed it being
 * asked for: every URL was built with the French filename prefix, so every one
 * of them 404'd. Their own markup spells the two differently.
 */
describe("locale prefixes", () => {
  const champa = {
    setCode: "bt1",
    number: "001",
    rarity: "Rare[R]",
    fullName: "Champa",
    awakenedName: "Champa, Dieu de la destruction",
  };

  it("writes the English filename in English, with its -en- segment", () => {
    const [first] = dbscardsFaceUrls({ ...champa, lang: "en" });
    expect(first).toContain("/cards/en/bt1/");
    expect(first).toContain("image-trading-cards-");
    expect(first).toContain("-tcg-dbscards-en-bt1-001-");
    expect(first).not.toContain("cartes-a-collectionner");
  });

  it("keeps the French filename French", () => {
    const [first] = dbscardsFaceUrls({ ...champa, lang: "fr" });
    expect(first).toContain("image-cartes-a-collectionner-");
    expect(first).not.toContain("-dbscards-en-");
  });

  it("reaches the untagged legacy pool for French only", () => {
    const fr = dbscardsFaceUrls({ ...champa, lang: "fr" });
    const en = dbscardsFaceUrls({ ...champa, lang: "en" });
    expect(fr.some((url) => url.includes("/cards/original/"))).toBe(true);
    // Nothing marks that pool's locale; on an English print it would hand back
    // a French face.
    expect(en.some((url) => url.includes("/cards/original/"))).toBe(false);
  });

  it("offers nothing for a locale it has no filename spelling for", () => {
    expect(dbscardsFaceUrls({ ...champa, lang: "jp" })).toEqual([]);
  });

  it("never repeats a URL", () => {
    // Both apostrophe spellings collapse on a name without one — which is most
    // of them — and each duplicate costs a round-trip to a host that can take
    // half a minute to answer.
    const urls = dbscardsFaceUrls({
      setCode: "bt12",
      number: "066",
      rarity: "Common[C]",
      fullName: "Kakuja",
      lang: "fr",
    });
    expect(urls.length).toBe(new Set(urls).size);
  });
});
