import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  COLEKA_NINJA_RANKS_LANG,
  colekaNinjaRanksBackUrl,
  colekaNinjaRanksBackUrlCandidates,
  colekaNinjaRanksFaceUrl,
  colekaNinjaRanksListingPageUrls,
  NINJA_RANKS_BASE_CARDS,
  parseColekaNinjaRanksListing,
  parseColekaPrintedRef,
  thumbCorroboratesPrintedRef,
  thumbCorroboratesRef,
  thumbIsPlaceholder,
} from "./parseColekaNinjaRanks";

/** Une fiche du listing, telle que Coleka l'écrit. */
function item(ref: string, title: string, stem: string): string {
  return `<a class="lib_has_2_lines" href="/en/trading-cards/panini-cards/naruto-ninja-ranks/x_i1${ref}" data-id="1${ref}">
    <img src="https://thumbs.coleka.com/media/item/202206/09/${stem}_250x250.webp">
    <h3 class="product-title">${title}</h3>
    <span class="ref"> Ref. ${ref} </span>
  </a>`;
}

describe("parseColekaNinjaRanksListing", () => {
  it("retient une fiche dont le nom de fichier répète le numéro", () => {
    const { cards } = parseColekaNinjaRanksListing(
      item("007", "Carte n°7", "naruto-ninja-ranks-carte-n-7-007"),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      setCode: "nr",
      number: "0007",
      printed: "7",
    });
    expect(cards[0]!.faceUrl).toBe(
      "https://thumbs.coleka.com/media/item/202206/09/naruto-ninja-ranks-carte-n-7-007.webp",
    );
  });

  it("retient un insert EU quand la ref et le fichier se croisent", () => {
    const { cards } = parseColekaNinjaRanksListing(
      item("FF01", "Flash Forward 1", "naruto-ninja-ranks-carte-ff1-ff01"),
    );
    expect(cards).toMatchObject([
      { setCode: "ff", number: "0001", printed: "FF01" },
    ]);
  });

  it("mappe GS EU vers le set bl du pack", () => {
    const { cards } = parseColekaNinjaRanksListing(
      item("GS03", "Group Seven 3", "naruto-ninja-ranks-carte-gs3-gs03"),
    );
    expect(cards).toMatchObject([
      { setCode: "bl", number: "0003", printed: "GS03" },
    ]);
  });

  it("refuse une vignette générique sur le listing — un seul signal ne suffit pas", () => {
    const { cards, rejected } = parseColekaNinjaRanksListing(
      item("003", "Groupe 7 kakashi sasuke", "coleka-carte-panini-naruto"),
    );
    expect(cards).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatch(/nom de fichier/);
  });

  it("refuse une ref numérique hors base, plutôt que de deviner", () => {
    const { cards, rejected } = parseColekaNinjaRanksListing(
      item("073", "Carte n°73", "naruto-ninja-ranks-carte-n-73-073"),
    );
    expect(cards).toHaveLength(0);
    expect(rejected[0]!.reason).toMatch(/hors checklist/);
    expect(NINJA_RANKS_BASE_CARDS).toBe(72);
  });

  it("ne rend qu'une carte par tirage, même vue deux fois", () => {
    const html =
      item("012", "Carte n°12", "naruto-ninja-ranks-carte-n-12-012") +
      item("012", "Carte n°12 bis", "naruto-ninja-ranks-carte-n-12-012");
    expect(parseColekaNinjaRanksListing(html).cards).toHaveLength(1);
  });

  it("rend les cartes dans l'ordre set puis numéro", () => {
    const html =
      item("040", "Carte n°40", "naruto-ninja-ranks-carte-n-40-040") +
      item("002", "Carte n°2", "naruto-ninja-ranks-carte-n-2-002") +
      item("NW02", "Ninja Way 2", "naruto-ninja-ranks-carte-nw2-nw02");
    expect(
      parseColekaNinjaRanksListing(html).cards.map(
        (c) => `${c.setCode}:${c.number}`,
      ),
    ).toEqual(["nr:0002", "nr:0040", "nw:0002"]);
  });

  it("ignore une fiche sans référence", () => {
    const html = `<a class="lib_has_2_lines" href="/x"><img src="https://thumbs.coleka.com/media/item/x_250x250.webp"><h3 class="product-title">X</h3></a>`;
    const { cards, rejected } = parseColekaNinjaRanksListing(html);
    expect(cards).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("dérive la pleine taille en retirant le suffixe de taille", () => {
    expect(
      colekaNinjaRanksFaceUrl("https://thumbs.coleka.com/a/b_250x250.webp"),
    ).toBe("https://thumbs.coleka.com/a/b.webp");
    expect(colekaNinjaRanksFaceUrl("https://thumbs.coleka.com/a/b.webp")).toBe(
      "https://thumbs.coleka.com/a/b.webp",
    );
  });

  it("dérive le verso sur www.coleka.com avec le suffixe -001", () => {
    expect(
      colekaNinjaRanksBackUrl(
        "https://thumbs.coleka.com/media/item/202206/11/naruto-ninja-ranks-carte-n-72-072.webp",
      ),
    ).toBe(
      "https://www.coleka.com/media/item/202206/11/naruto-ninja-ranks-carte-n-72-072-001.webp",
    );
  });

  it("sonde -001 puis -002 quand le verso n'est pas le premier", () => {
    expect(
      colekaNinjaRanksBackUrlCandidates(
        "https://thumbs.coleka.com/media/item/202206/09/naruto-ninja-ranks-carte-n-1-001.webp",
      ),
    ).toEqual([
      "https://www.coleka.com/media/item/202206/09/naruto-ninja-ranks-carte-n-1-001-001.webp",
      "https://www.coleka.com/media/item/202206/09/naruto-ninja-ranks-carte-n-1-001-002.webp",
    ]);
  });

  it("lit le numéro dans le nom de fichier, zéros de tête compris", () => {
    expect(
      thumbCorroboratesRef("https://x/carte-n-7-007_250x250.webp", 7),
    ).toBe(true);
    expect(
      thumbCorroboratesRef("https://x/coleka-carte-panini_250x250.webp", 3),
    ).toBe(false);
    expect(
      thumbCorroboratesRef("https://x/carte-n-17-017_250x250.webp", 7),
    ).toBe(false);
  });

  it("lit la ref imprimée dans les inserts", () => {
    expect(
      thumbCorroboratesPrintedRef(
        "https://x/naruto-ninja-ranks-carte-ff1-ff01_250x250.webp",
        "FF01",
      ),
    ).toBe(true);
    expect(
      thumbCorroboratesPrintedRef(
        "https://x/naruto-ninja-ranks-haku-holographique-nw05_250x250.webp",
        "NW05",
      ),
    ).toBe(true);
    expect(
      thumbCorroboratesPrintedRef(
        "https://x/naruto-ninja-ranks-carte-n-7-007_250x250.webp",
        "007",
      ),
    ).toBe(true);
  });

  it("parse les refs imprimées Coleka", () => {
    expect(parseColekaPrintedRef("007")).toMatchObject({
      setCode: "nr",
      number: "0007",
      printed: "7",
    });
    expect(parseColekaPrintedRef("NS06")).toMatchObject({
      setCode: "ns",
      number: "0006",
      printed: "NS06",
    });
    expect(parseColekaPrintedRef("GS01")).toMatchObject({
      setCode: "bl",
      number: "0001",
      printed: "GS01",
    });
    expect(parseColekaPrintedRef("073")).toBeNull();
  });

  it("vise la branche EN, qui tient mieux que la FR", () => {
    const urls = colekaNinjaRanksListingPageUrls();
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("/en/trading-cards/panini-cards/");
    expect(urls[2]).toMatch(/\?p=2$/);
  });
});

describe("gabarits « pas encore photographiée »", () => {
  it("refuse le gabarit dont le fichier répète le slug de la collection", () => {
    const { cards, rejected } = parseColekaNinjaRanksListing(
      item(
        "006",
        "Carte n°6",
        "naruto-ninja-ranks-panini-naruto-ninja-ranks-6-006",
      ),
    );
    expect(cards).toHaveLength(0);
    expect(rejected[0]!.reason).toMatch(/gabarit/);
  });

  it("laisse passer un vrai scan dont le titre nomme la carte", () => {
    const { cards } = parseColekaNinjaRanksListing(
      item(
        "068",
        "Secon examen des survivants",
        "naruto-ninja-ranks-secon-examen-des-survivants-068",
      ),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]!.number).toBe("0068");
  });

  it("reconnaît le gabarit sur son seul nom de fichier", () => {
    expect(
      thumbIsPlaceholder(
        "https://x/naruto-ninja-ranks-panini-naruto-ninja-ranks-20-020_250x250.webp",
      ),
    ).toBe(true);
    expect(
      thumbIsPlaceholder(
        "https://x/naruto-ninja-ranks-carte-n-7-007_250x250.webp",
      ),
    ).toBe(false);
  });

  it("étiquette les faces de l'édition photographiée, pas de celle des titres", () => {
    expect(COLEKA_NINJA_RANKS_LANG).toBe("fr");
  });
});

describe("listings Coleka en cache", () => {
  const stagingDir = path.join(
    process.cwd(),
    "data/naruto/ninja-ranks/staging/coleka-ninja-ranks",
  );
  const listings = readdirSync(stagingDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^listing-\d+\.html$/.test(entry.name))
    .map((entry) => path.join(stagingDir, entry.name));

  it.skipIf(listings.length === 0)(
    "accepte 59 base + 30 inserts EU photographiés",
    () => {
      const cards = listings.flatMap(
        (file) =>
          parseColekaNinjaRanksListing(readFileSync(file, "utf8")).cards,
      );
      const bySet = Object.groupBy(cards, (card) => card.setCode);
      expect(bySet.nr?.length).toBe(59);
      expect(bySet.ff?.length).toBe(6);
      expect(bySet.nw?.length).toBe(9);
      expect(bySet.sd?.length).toBe(6);
      expect(bySet.ns?.length).toBe(6);
      expect(bySet.bl?.length).toBe(3);
      expect(cards).toHaveLength(89);
    },
  );
});
