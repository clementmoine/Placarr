import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { packStagingDir } from "@/lib/packPaths";
import {
  ARCADE_LANG,
  arcadeBackImageUrl,
  arcadeListingUrls,
  arcadeReferenceToCard,
  fileEchoesReference,
  namesAgree,
  parseArcadeListing,
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
  contiguousBands,
  IMADOKI_LANG,
  IMADOKI_SHEETS,
  IMADOKI_SHEETS_SKIPPED,
  imadokiSheetUrl,
  splitAxis,
} from "./catalogues";
import { createArcadeNameCheck } from "../sources/faces";
import { NARUTO_RANKS_PACK_ID } from "../pack";

// —— parseArcadeGameCards ——
{
  /** Un bloc produit, tel que la boutique l'écrit. */
  function product(printed: string, name: string, file: string): string {
    return `<li class="product type-product">
      <a href="/product/x"><img src="https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/02/${file}?w=740&ssl=1"></a>
      <h2 class="woocommerce-loop-product__title">Naruto 2002 Panini Card ${printed} ${name}</h2>
    </li>`;
  }

  const CHECKLIST: Record<string, string> = {
    "nr-0001": "Title Card",
    "nr-0002": "Group 7 puzzle",
    "nr-0006": "Naruto-Sasuke-Sakura",
    "nr-0010": "Naruto",
    "nr-0040": "Rock lee",
    "sd-0003": "Sasuke",
    "sd-0004": "Kakashi",
    "ff-0001": "Guy - Kakashi",
  };
  const nameCheck = (setCode: string, number: string, vendorName: string) => {
    const expected = CHECKLIST[`${setCode}-${number}`];
    if (!expected) return false;
    return namesAgree(vendorName, expected);
  };

  describe("parseArcadeListing", () => {
    it("retient une carte dont la référence, le fichier et le nom concordent", () => {
      const { cards } = parseArcadeListing(
        product("40", "Rock lee", "naruto2002paninicard40front.jpg"),
        nameCheck,
      );
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ setCode: "nr", number: "0040" });
    });

    it("accepte card010front pour la carte 10", () => {
      const { cards } = parseArcadeListing(
        product("10", "Naruto", "naruto2002paninicard010front.jpg"),
        nameCheck,
      );
      expect(cards).toMatchObject([{ setCode: "nr", number: "0010" }]);
    });

    it("accepte les suffixes personnages sur les puzzles Groupe 7", () => {
      const { cards } = parseArcadeListing(
        product("02", "Group 7 Naruto Sakura", "naruto2002paninicard02front.jpg"),
        nameCheck,
      );
      expect(cards).toMatchObject([{ setCode: "nr", number: "0002" }]);
    });

    it("accepte un insert, dont le fichier porte le code", () => {
      const { cards } = parseArcadeListing(
        product("FF1", "Guy Kakashi", "naruto2002paniniff1front.jpg"),
        nameCheck,
      );
      expect(cards[0]).toMatchObject({ setCode: "ff", number: "0001" });
    });

    it("refuse les deux fiches SD dont les noms sont intervertis", () => {
      const html =
        product("SD3", "Kakashi", "naruto2002paninisd3front-e161.jpg") +
        product("SD3", "Sasuke", "naruto2002paninisd4front-e161.jpg");
      const { cards, rejected } = parseArcadeListing(html, nameCheck);
      expect(cards).toHaveLength(0);
      expect(rejected).toHaveLength(2);
      expect(rejected[0]!.reason).toMatch(/checklist/);
      expect(rejected[1]!.reason).toMatch(/ne redit pas la référence/);
    });

    it("refuse une fiche dont le nom ne passe pas la checklist", () => {
      const { cards, rejected } = parseArcadeListing(
        product("99", "Inconnue", "naruto2002paninicard99front.jpg"),
        () => false,
      );
      expect(cards).toHaveLength(0);
      expect(rejected[0]!.reason).toMatch(/checklist/);
    });
  });

  describe("createArcadeNameCheck", () => {
    it("accepte le titre vendeur attesté de la carte 1", () => {
      const check = createArcadeNameCheck();
      expect(check("nr", "0001", "The Ninja Are Here")).toBe(true);
    });
  });

  describe("les trois signaux, pris un par un", () => {
    it("lit la référence : nue pour la base, préfixée pour un insert", () => {
      expect(arcadeReferenceToCard("02")).toEqual({
        setCode: "nr",
        number: "0002",
      });
      expect(arcadeReferenceToCard("FF1")).toEqual({
        setCode: "ff",
        number: "0001",
      });
      expect(arcadeReferenceToCard("")).toBeNull();
    });

    it("vérifie que le fichier redit la référence", () => {
      expect(
        fileEchoesReference("https://x/naruto2002paninicard02front.jpg", "02"),
      ).toBe(true);
      expect(
        fileEchoesReference("https://x/naruto2002paninicard010front.jpg", "10"),
      ).toBe(true);
      expect(
        fileEchoesReference("https://x/naruto2002paniniff1front.jpg", "FF1"),
      ).toBe(true);
      expect(
        fileEchoesReference("https://x/naruto2002paninisd4front-e1.jpg", "SD3"),
      ).toBe(false);
      expect(
        fileEchoesReference("https://x/naruto2002paninicard12front.jpg", "02"),
      ).toBe(false);
    });

    it("compare les noms sans buter sur la casse ni les séparateurs", () => {
      expect(namesAgree("Guy Kakashi", "Guy - Kakashi")).toBe(true);
      expect(namesAgree("Rock lee", "ROCK LEE")).toBe(true);
      expect(namesAgree("Naruto Sakura Sasuke", "Naruto-Sasuke-Sakura")).toBe(
        true,
      );
      expect(namesAgree("Kakashi", "Sasuke")).toBe(false);
    });

    it("dérive le verso en remplaçant front par back dans l'URL", () => {
      expect(
        arcadeBackImageUrl(
          "https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/02/naruto2002paninicard72front.jpg?w=740",
        ),
      ).toBe(
        "https://i0.wp.com/www.arcadegamecards.com/wp-content/uploads/2021/02/naruto2002paninicard72back.jpg?w=740",
      );
    });

    it("vise l'édition américaine, sur trois pages", () => {
      expect(ARCADE_LANG).toBe("en");
      const urls = arcadeListingUrls();
      expect(urls).toHaveLength(3);
      expect(urls[2]).toMatch(/page\/3\/$/);
    });
  });

  const STAGING = path.join(
    packStagingDir(NARUTO_RANKS_PACK_ID),
    "arcadegamecards",
  );
  const HAS_CACHED_LISTING = existsSync(path.join(STAGING, "listing-0.html"));

  describe.skipIf(!HAS_CACHED_LISTING)(
    "moisson arcadegamecards (HTML en cache, 2026-08-22)",
    () => {
      it("accepte 78 prints et refuse exactement trois fiches", () => {
        const check = createArcadeNameCheck();
        const found = new Map<string, string>();
        const rejected: { printed: string; reason: string }[] = [];

        for (const f of readdirSync(STAGING).filter((x) =>
          x.startsWith("listing-"),
        )) {
          const { cards, rejected: pageRejected } = parseArcadeListing(
            readFileSync(path.join(STAGING, f), "utf8"),
            check,
          );
          for (const c of cards) found.set(`${c.setCode}-${c.number}`, c.printed);
          rejected.push(...pageRejected);
        }

        expect(found.size).toBe(78);
        expect(rejected).toHaveLength(3);
        expect(rejected.map((r) => r.printed).sort()).toEqual([
          "21",
          "SD3",
          "SD3",
        ]);
      });

      it("couvre 71/72 cartes de base", () => {
        const check = createArcadeNameCheck();
        const nr = new Set<string>();
        for (const f of readdirSync(STAGING).filter((x) =>
          x.startsWith("listing-"),
        )) {
          const { cards } = parseArcadeListing(
            readFileSync(path.join(STAGING, f), "utf8"),
            check,
          );
          for (const c of cards) {
            if (c.setCode === "nr") nr.add(c.number);
          }
        }
        expect(nr.size).toBe(71);
        expect(nr.has("0021")).toBe(false);
        for (const n of ["0001", "0002", "0003", "0006", "0010"]) {
          expect(nr.has(n)).toBe(true);
        }
      });
    },
  );
}

// —— parseColekaNinjaRanks ——
{
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
}

// —— parseImadokiSheets ——
{
  describe("manifeste des planches", () => {
    it("déclare autant de cases que la grille en porte", () => {
      for (const sheet of IMADOKI_SHEETS) {
        expect(sheet.slots, sheet.file).toHaveLength(sheet.columns * sheet.rows);
      }
    });

    it("ne nomme jamais deux fois le même tirage", () => {
      const seen = new Set<string>();
      for (const sheet of IMADOKI_SHEETS) {
        for (const slot of sheet.slots) {
          if (!slot) continue;
          const key = `${slot.setCode}-${slot.number}`;
          expect(seen.has(key), key).toBe(false);
          seen.add(key);
        }
      }
      // 72 de base + FF6 + NW9 + NS5 (Guy absent) + SD5 (la 4 manque) + BL3.
      expect(seen.size).toBe(72 + 6 + 9 + 5 + 5 + 3);
    });

    it("laisse la case de `sd-0004` vide, absente de la galerie", () => {
      const sheet = IMADOKI_SHEETS.find((s) => s.file.includes("sd01-06"))!;
      expect(sheet.slots[3]).toBeNull();
      expect(sheet.slots[4]).toEqual({ setCode: "sd", number: "0005" });
      // GS1-3 sont nos box loaders.
      expect(sheet.slots[6]).toEqual({ setCode: "bl", number: "0001" });
    });

    it("écarte le sachet, en disant pourquoi", () => {
      expect(IMADOKI_SHEETS_SKIPPED).toHaveLength(1);
      expect(IMADOKI_SHEETS_SKIPPED[0]!.file).toBe("naruto_premiumtc_pack.JPG");
      const files = IMADOKI_SHEETS.map((s) => s.file);
      for (const skipped of IMADOKI_SHEETS_SKIPPED) {
        expect(files).not.toContain(skipped.file);
      }
    });

    it("mappe la planche NS sur les tirages EU-only (grille 2×3 paysage)", () => {
      const sheet = IMADOKI_SHEETS.find((s) => s.file.includes("ns01-06"))!;
      expect(sheet.columns).toBe(2);
      expect(sheet.rows).toBe(3);
      expect(sheet.gridMode).toBe("equal");
      expect(sheet.slots).toEqual([
        { setCode: "ns", number: "0004" },
        { setCode: "ns", number: "0001" },
        { setCode: "ns", number: "0005" },
        { setCode: "ns", number: "0002" },
        { setCode: "ns", number: "0006" },
        null,
      ]);
    });

    it("étiquette les faces dans la langue de l'édition photographiée", () => {
      expect(IMADOKI_LANG).toBe("it");
    });

    it("construit l'URL d'une planche", () => {
      expect(imadokiSheetUrl("x.JPG")).toBe(
        "https://www.imadokicollection.it/WebImadoki_04_Card_Gallery/image_world/x.JPG",
      );
    });
  });

  describe("découpe de la grille", () => {
    /** Un axe de `size` px : `cells` cases séparées par des gouttières blanches. */
    function axis(size: number, cells: number, gutter = 20): number[] {
      const cell = Math.floor((size - gutter * (cells - 1)) / cells);
      const out = new Array<number>(size).fill(0);
      for (let c = 0; c < cells - 1; c += 1) {
        const start = (c + 1) * cell + c * gutter;
        for (let i = start; i < start + gutter; i += 1) out[i] = 1;
      }
      return out;
    }

    it("coupe en trois quand les deux gouttières sont là", () => {
      const cuts = splitAxis(axis(750, 3), 3);
      expect(cuts).not.toBeNull();
      expect(cuts).toHaveLength(3);
      expect(cuts![0]![0]).toBe(0);
    });

    it("extrapole le pas quand une rangée vide avale sa gouttière", () => {
      // Le cas réel de la planche 19-27 : la troisième rangée est blanche, donc
      // la gouttière qui la précède ne se distingue plus du fond.
      const full = axis(1035, 3);
      const oneGutter = full.map((v, i) => (i > 600 ? 0 : v));
      const cuts = splitAxis(oneGutter, 3);
      expect(cuts).not.toBeNull();
      expect(cuts).toHaveLength(3);
      // Le pas reste régulier : les trois cases ont sensiblement la même hauteur.
      const heights = cuts!.map(([a, b]) => b - a);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(30);
    });

    it("refuse une planche qui a trop de gouttières pour sa grille", () => {
      expect(splitAxis(axis(750, 5), 3)).toBeNull();
    });

    it("trouve les bandes contiguës, et ignore les trop courtes", () => {
      expect(contiguousBands([false, true, true, true, false], 3)).toEqual([
        [1, 4],
      ]);
      expect(contiguousBands([true, true, false], 3)).toEqual([]);
    });
  });
}
