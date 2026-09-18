import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { curatedCardsDir, destBackWebpName, listCuratedBackSources } from "@/providers/shared/curatedCardsInstall";
import aventurasAventurescas7 from "../curated/sources/aventurasaventurescas7.json";
import hawk from "../curated/sources/band-of-the-hawk.json";
import bandaiCom from "../curated/sources/bandai-com-naruto.json";
import bandaicgEnCardlist from "../curated/sources/bandaicg-en-cardlist.json";
import bggEnCcgS1 from "../curated/sources/bgg-en-ccg-s1.json";
import carddasCom from "../curated/sources/carddas-com-naruto.json";
import carddasJpCardlist from "../curated/sources/carddas-jp-cardlist.json";
import carddasJpPromo from "../curated/sources/carddas-jp-promo.json";
import cardgameclubItCardlist from "../curated/sources/cardgameclub-it-cardlist.json";
import chatLinks from "../curated/sources/chat-links-2026-08-16.json";
import colekaHoloType from "../curated/sources/coleka-holo-type.json";
import colekaS24 from "../curated/sources/coleka-s24.json";
import colekaS28 from "../curated/sources/coleka-s28.json";
import colekaS6It from "../curated/sources/coleka-s6-it.json";
import colekaUsPromos from "../curated/sources/coleka-us-promos.json";
import coleka from "../curated/sources/coleka.json";
import collectorsComet from "../curated/sources/collectors-comet.json";
import ebay from "../curated/sources/ebay.json";
import enCcgSeries from "../curated/sources/en-ccg-series.json";
import fandomEnCcg from "../curated/sources/fandom-en-ccg.json";
import goat from "../curated/sources/goat-en-ccg.json";
import leboncoin from "../curated/sources/leboncoin.json";
import lineage2 from "../curated/sources/lineage2universe.json";
import mangaNewsPackshots from "../curated/sources/manga-news-packshots.json";
import mawo from "../curated/sources/mawo-cards.json";
import narutoCcgApp from "../curated/sources/naruto-ccg-app.json";
import narutoCcgDrive from "../curated/sources/naruto-ccg-drive.json";
import narutoCcgFansetsDrive from "../curated/sources/naruto-ccg-fansets-drive.json";
import montreal from "../curated/sources/naruto-montreal.json";
import narutocardsCa from "../curated/sources/narutocards-ca.json";
import narutozabuza from "../curated/sources/narutozabuza.json";
import neokyoGuide from "../curated/sources/neokyo-naruto-cards-guide.json";
import primalMarketplace from "../curated/sources/primal-tcg-marketplace.json";
import puja39 from "../curated/sources/puja39-deviantart.json";
import redditNarutoccg from "../curated/sources/reddit-narutoccg.json";
import slabZ2002 from "../curated/sources/slab-z-2002-carddass.json";
import surugaCarddass from "../curated/sources/suruga-ya-carddass.json";
import surugaDataCarddass from "../curated/sources/suruga-ya-data-carddass.json";
import tcdb from "../curated/sources/tcdb-en-ccg.json";
import tradecardsonline from "../curated/sources/tradecardsonline.json";
import trictrac from "../curated/sources/trictrac.json";
import physical from "../curated/sources/user-physical-ccg.json";
import vialudibunda from "../curated/sources/vialudibunda.json";
import vintageNaruto from "../curated/sources/vintage-naruto-ccg.json";
import { narutoDiskCardId } from "../identity";
import { parseTcdbNarutoRef } from "../parse/catalogues";
import { mercariIngestFaces } from "../sources/faces";
import { curatedDestStale, listCuratedReconstructedFaces, opaqueBounds, narutoCuratedDir } from "./curated";

// —— curated ——
{
  /** Alpha plane with a `bleed`-wide fully transparent frame. */
  function framed(width: number, height: number, bleed: number): Uint8Array {
    const a = new Uint8Array(width * height).fill(255);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const edge =
          x < bleed || y < bleed || x >= width - bleed || y >= height - bleed;
        if (edge) a[y * width + x] = 0;
      }
    }
    return a;
  }

  describe("curatedDestStale", () => {
    it("is stale when dest is missing", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-"));
      const src = path.join(root, "src.png");
      writeFileSync(src, "x");
      expect(curatedDestStale(src, path.join(root, "missing.webp"))).toBe(true);
    });

    it("is stale when curated source is newer than dest", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-"));
      const src = path.join(root, "src.png");
      const dest = path.join(root, "dest.webp");
      writeFileSync(src, "src");
      writeFileSync(dest, "dest");
      const older = new Date("2020-01-01T00:00:00Z");
      const newer = new Date("2024-06-01T00:00:00Z");
      utimesSync(dest, older, older);
      utimesSync(src, newer, newer);
      expect(curatedDestStale(src, dest)).toBe(true);
    });

    it("is fresh when dest is as new as the source", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-"));
      mkdirSync(root, { recursive: true });
      const src = path.join(root, "src.png");
      const dest = path.join(root, "dest.webp");
      writeFileSync(src, "src");
      writeFileSync(dest, "dest");
      const t = new Date("2024-06-01T00:00:00Z");
      utimesSync(src, t, t);
      utimesSync(dest, t, t);
      expect(curatedDestStale(src, dest)).toBe(false);
    });
  });

  describe("listCuratedReconstructedFaces", () => {
    it("reads lang from the folder, not a hardcoded locale", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-faces-"));
      const cards = path.join(root, "cards");
      mkdirSync(path.join(cards, "ninja", "n0001", "en"), { recursive: true });
      mkdirSync(path.join(cards, "ninja", "ni0001", "fr"), { recursive: true });
      writeFileSync(
        path.join(cards, "ninja", "n0001", "en", "art.reconstructed.png"),
        "en",
      );
      writeFileSync(
        path.join(cards, "ninja", "ni0001", "fr", "art.reconstructed.png"),
        "fr",
      );
      writeFileSync(
        path.join(cards, "ninja", "ni0001", "fr", "source.jpg"),
        "pic",
      );
      writeFileSync(path.join(cards, "back.fr.png"), "back");

      expect(
        listCuratedReconstructedFaces(cards).map((f) => `${f.cardId}/${f.lang}`),
      ).toEqual(["n0001/en", "ni0001/fr"]);
    });

    it("does not misread promo/{pr0096}/{fr} as legacy promo/{lang}/{card}", () => {
      const root = mkdtempSync(path.join(tmpdir(), "naruto-curated-promo-"));
      const cards = path.join(root, "cards");
      mkdirSync(path.join(cards, "promo", "pr0096", "fr"), { recursive: true });
      mkdirSync(path.join(cards, "promo", "fr", "pr0011"), { recursive: true });
      writeFileSync(
        path.join(cards, "promo", "pr0096", "fr", "art.reconstructed.png"),
        "new",
      );
      writeFileSync(
        path.join(cards, "promo", "fr", "pr0011", "art.reconstructed.png"),
        "legacy",
      );

      expect(
        listCuratedReconstructedFaces(cards)
          .map((f) => `${f.family}/${f.cardId}/${f.lang}`)
          .sort(),
      ).toEqual(["promo/pr0011/fr", "promo/pr0096/fr"]);
    });
  });

  describe("opaqueBounds", () => {
    it("leaves a fully opaque image untouched", () => {
      const a = new Uint8Array(10 * 20).fill(255);
      expect(opaqueBounds(a, 10, 20)).toEqual({
        left: 0,
        top: 0,
        width: 10,
        height: 20,
      });
    });

    it("trims a 1px transparent frame on all four sides", () => {
      // Regression: requiring a *fully* opaque row collapsed this to 1x1,
      // because the left and right bleed puts a transparent pixel in every row.
      expect(opaqueBounds(framed(30, 40, 1), 30, 40)).toEqual({
        left: 1,
        top: 1,
        width: 28,
        height: 38,
      });
    });

    it("trims an asymmetric bleed", () => {
      const w = 12;
      const h = 8;
      const a = new Uint8Array(w * h).fill(255);
      for (let x = 0; x < w; x += 1) a[x] = 0; // top row
      for (let y = 0; y < h; y += 1) a[y * w] = 0; // left column
      expect(opaqueBounds(a, w, h)).toEqual({
        left: 1,
        top: 1,
        width: 11,
        height: 7,
      });
    });

    it("does not run past the far edge when everything is transparent", () => {
      const a = new Uint8Array(6 * 6).fill(0);
      const box = opaqueBounds(a, 6, 6);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    });
  });
}

// —— curatedBacks ——
{
  function listRelFiles(dir: string, prefix = ""): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) out.push(...listRelFiles(abs, rel));
      else out.push(rel);
    }
    return out.sort();
  }

  describe("Naruto curated tree", () => {
    const root = narutoCuratedDir();
    const cards = curatedCardsDir(root);

    /*
      `products/` a rejoint l'arbre le 2026-08-20 : les visuels de produit faits
      à la main — badges de série découpés, logo du jeu, emballages photographiés,
      retouches d'un visuel mal cadré par sa source. Ils ne peuvent pas vivre dans
      `staging/`, qui se reconstruit par script et les effacerait sans bruit.
    */
    it("is cards + products + sources (+ ledger JSON) — no markdown, no leftover trees", () => {
      expect(
        readdirSync(root)
          .filter((n) => !n.startsWith("."))
          .sort(),
      ).toEqual([
        "booster-composition.json",
        "cards",
        "landscape-prints.json",
        "products",
        "products-contents.json",
        "sources",
      ]);
      const files = listRelFiles(root);
      expect(files.filter((f) => f.endsWith(".md"))).toEqual([]);
      expect(
        files.some(
          (f) => f.startsWith("en-ccg/") || f.startsWith("reconstructed/"),
        ),
      ).toBe(false);
      expect(files).not.toContain("cards/back.png");
    });

    it("ships one attested verso per language at pack root", () => {
      const dests = readdirSync(cards)
        .map((name) => destBackWebpName(name))
        .filter((name): name is string => Boolean(name))
        .sort();
      expect(dests).toEqual([
        "back.en.webp",
        "back.fr.webp",
        "back.ja.webp",
      ]);
    });

    /*
      Le pack ne porte plus qu'**un** jeu. Le verso du 「NARUTO 疾風伝 カードゲーム」
      (2007-2009) vivait ici sous `shi/`, faute d'un pack à lui ; il est parti
      avec son jeu le 2026-08-21 et son propre test l'atteste à destination.

      Ce qui reste doit rester **complet** : trois versos (JA+FR+EN), et rien
      d'autre — un quatrième signalerait une langue hors contrat catalogue.
    */
    it("ships nothing but the three Carddass versos (JA+FR+EN)", () => {
      expect(listCuratedBackSources(cards).map((row) => row.destRel)).toEqual([
        "back.en.webp",
        "back.fr.webp",
        "back.ja.webp",
      ]);
    });

    it("files reconstructed faces under {family}/{id}/{lang}/, not a flat dump", () => {
      const faces = listCuratedReconstructedFaces(cards);
      expect(
        faces.map((f) => `${f.family}/${f.cardId}/${f.lang}`).sort(),
      ).toEqual([
        "jutsu/te0212/fr",
        /*
          Les huit 騎 (guerriers de Gelel), recadrées à la main : les seules
          faces qu'on avait étaient des photos eBay carrées de 1600×1600, où la
          carte n'occupe qu'une partie du cadre.
        */
        "knight/ki0001/ja",
        "knight/ki0002/ja",
        "knight/ki0003/ja",
        "knight/ki0004/ja",
        "knight/ki0005/ja",
        "knight/ki0006/ja",
        "knight/ki0007/ja",
        "knight/ki0008/ja",
        "mission/ta0221/fr",
        "mission/ta0226/fr",
        /*
          Les quatre du bonus PS1, restaurées depuis les photos Mercari : ce sont
          les seules reconstructions japonaises, et les seules dont l'original
          n'est pas un scan officiel abîmé mais une photo de collectionneur —
          aucun scan à plat de ces cartes n'existe. Leur photo source n'est plus
          copiée en git : c'est la ligne mercdn du ledger `mercari.json`.
        */
        "ninja/ni0001-ps/ja",
        "ninja/ni0002-ps/ja",
        "ninja/ni0003-ps/ja",
        "ninja/ni0011-ps/ja",
        "ninja/ni0194/fr",
        "ninja/ni0195/fr",
        "ninja/ni0232/fr",
        "ninja/ni0236/fr",
        "ninja/ni0241/fr",
        "ninja/ni0252/fr",
        "ninja/ni0253/fr",
        /*
          PR-95 / PR-96 : reconstructions FR du 2026-09-04, source.jpg à côté —
          aucun scan à plat de ces promos n'était détenu.
        */
        "promo/pr0095/fr",
        "promo/pr0096/fr",
      ]);
      /*
        Chaque reconstruction reste auditable : soit la photo d'origine est à
        côté (`source.jpg`), soit c'est une restauration Mercari dont la photo
        vit sur mercdn — la ligne d'ingestion du ledger fait alors provenance.
      */
      const mercariDiskIds = new Set(
        mercariIngestFaces().map((row) => narutoDiskCardId(row.printedRef)),
      );
      for (const face of faces) {
        expect(path.basename(face.source)).toMatch(
          /^art\.reconstructed\.(png|webp)$/i,
        );
        const hasSourcePhoto = existsSync(
          path.join(path.dirname(face.source), "source.jpg"),
        );
        if (!hasSourcePhoto) {
          expect(mercariDiskIds.has(face.cardId), face.cardId).toBe(true);
        }
      }
    });
  });
}

// —— curatedEnCcgProbes ——
{
  describe("EN CCG source ledgers", () => {
    it("ingests Vintage Naruto / CCG Trader 750×1050 faces, skipping set 29", () => {
      expect(vintageNaruto.ingest).toBe("faces");
      expect(vintageNaruto.lang).toBe("en");
      expect(vintageNaruto.servedPixels).toEqual({ width: 750, height: 1050 });
      expect(vintageNaruto.urls.browse).toBe("https://vintagenaruto.com/browse");
      expect(vintageNaruto.skip).toContain("shinobis-dream");
      expect(vintageNaruto.not).toContain("carddass");
    });

    it("ingests Goat shop faces at served 350×490, not the unserved EXIF original", () => {
      expect(goat.ingest).toBe("faces");
      expect(goat.catalog.verso).toBe(false);
      expect(goat.servedPixels).toEqual({ width: 350, height: 490 });
      expect(goat.urls.cdnN1646).toContain("6578562/n1646.jpg");
      expect(goat.urls.umbrella).toContain("/3837");
      expect(goat.urls.storm3Catalog).toContain("/3920");
      expect(goat.urls.storm3CatalogPage5).toContain("page=5");
      expect(goat.umbrella.id).toBe(3837);
      expect(goat.sets.map((row) => row.setCode)).toEqual([
        "s1",
        "s2",
        "s3",
        "s4",
        "s5",
        "s6",
        "s7",
        "s8",
        "s9",
        "s10",
        "s11",
        "s8",
        "s12",
        "s13",
        "s14",
        "s15",
        "s16",
        "s17",
        "s18",
        "s19",
        "s20",
        "s21",
        "s22",
        "s23",
        "s24",
        "s25",
        "s26",
        "s27",
        "s28",
      ]);
      expect(goat.sets.find((row) => row.id === 3885)?.role).toBe("main");
      expect(goat.sets.find((row) => row.id === 3887)?.role).toBe(
        "reprints-drawer",
      );
      expect(goat.sets.find((row) => row.setCode === "s6")?.not).toBe(
        "carddass-it-s6",
      );
      expect(goat.sealed.crawl).toBe(false);
      expect(goat.urls.sealedBoosterBoxes).toContain("/3970");
      expect(goat.sealed.boosterBoxes.id).toBe(3970);
      expect(goat.sealed.boosterBoxes.pages).toBe(2);
      expect(goat.sealed.boosterBoxes.ingest).toBe("none");
      expect(goat.sealed.boosterBoxes.packshots.ingest).toBe("all-cdn-displays");
      expect(goat.sealed.boosterBoxes.packshots.mintSku).toEqual([
        "s16",
        "s19",
        "s21",
        "s22",
        "s23",
        "s27",
      ]);
      expect(goat.sealed.boosterBoxes.products).toHaveLength(34);
      expect(goat.sealed.boosterBoxes.absent).toEqual([
        "s3",
        "s25",
        "s26",
        "s28",
        "tournament-1",
      ]);
      const jpBoxes = goat.sealed.boosterBoxes.products.filter(
        (row) => row.kind === "jp-box",
      );
      expect(jpBoxes.map((row) => row.id)).toEqual([561419, 561420]);
      expect(
        jpBoxes.every(
          (row) => row.setCode === null && row.photo === "placeholder",
        ),
      ).toBe(true);
      const eternal = goat.sealed.boosterBoxes.products.find(
        (row) => row.id === 561400,
      );
      expect(eternal?.setCode).toBe("s6");
      expect(eternal?.not).toEqual(["carddass-it-s6", "display-s6"]);
      expect(
        goat.sealed.boosterBoxes.products
          .filter((row) => row.kind === "blister-case")
          .map((row) => row.id),
      ).toEqual([564642, 564641]);
      expect(
        goat.sealed.boosterBoxes.products
          .filter((row) => row.colekaGap)
          .map((row) => row.setCode)
          .sort(),
      ).toEqual(["s16", "s19", "s21", "s22", "s23", "s27"]);
      expect(
        goat.sealed.boosterBoxes.products.find((row) => row.setCode === "s1")
          ?.not,
      ).toContain("display-s1");
      expect(
        goat.sealed.boosterBoxes.products
          .filter((row) => row.ingestPackshot)
          .map((row) => row.sku)
          .sort(),
      ).toEqual([
        "display-s16",
        "display-s19",
        "display-s21",
        "display-s22",
        "display-s23",
        "display-s27",
      ]);
      const broken = goat.sealed.boosterBoxes.products.find(
        (row) => row.setCode === "s16",
      );
      expect(broken?.bytes).toBe("gif89a");
      expect(broken?.staging).toBe("staging/goat-en-boxes/s16.gif");
    });

    it("records Montréal as Bandai CDN breadcrumbs, not catalogue art", () => {
      expect(montreal.ingest).toBe("none");
      expect(montreal.waybackCardsS28).toBe(0);
      expect(montreal.bandaiStoppedAfterSet).toBe(28);
      expect(montreal.hotlinkFoldersSeen).toContain("cards_s28");
      expect(montreal.hotlinkPattern).toContain("bandai.com/naruto/images");
    });

    it("distinguishes www.bandai.com from bandaicg.com and marks s28 as gone", () => {
      expect(bandaiCom.wayback.s28Rows).toBe(0);
      expect(bandaiCom.githubDump).toBe(false);
      expect(bandaiCom.sameTreeAs).toContain("bandaicg.com");
      expect(bandaiCom.ingestS28).toMatch(/stop2shop/);
    });

    it("keeps lineage2universe as a living index, including unofficial set 29", () => {
      expect(lineage2.officialCdn).toBe(false);
      expect(lineage2.ingest).toBe("none");
      expect(lineage2.covers).toContain("custom-set-29");
      expect(lineage2.covers).toContain("s1-s28");
      expect(lineage2.storefront).toBe(
        "https://payhip.com/BandoftheHawkCardShop",
      );
    });

    it("keeps Band of the Hawk Payhip as custom printables, not EN CCG faces", () => {
      expect(hawk.ingest).toBe("none");
      expect(hawk.kind).toBe("custom-printables");
      expect(hawk.officialCdn).toBe(false);
      expect(hawk.url).toBe("https://payhip.com/BandoftheHawkCardShop");
      expect(hawk.sampleSkus).toContain("n184");
      expect(hawk.related).toBe("lineage2universe.json");
    });

    it("keeps Mawo SALE-DE/STO3-DE as German CCG shop SKUs, not Carddass NI", () => {
      expect(mawo.ingest).toBe("none");
      expect(mawo.crawl).toBe(false);
      const s24 = mawo.boosters.find((row) => row.setCode === "s24");
      const s28 = mawo.boosters.find((row) => row.setCode === "s28");
      expect(s24?.sample).toMatchObject({
        shopSku: "SALE-DE001",
        printed: "NI-1358",
        diskHint: "n1358",
      });
      expect(s24?.sample.not).toContain("ni1358");
      expect(s28?.sample).toMatchObject({
        shopSku: "STO3-DE001",
        printed: "NI-1621",
        diskHint: "n1621",
      });
      expect(mawo.skip[0]).toMatchObject({
        sku: "NB02",
        line: "chrono-clash",
      });
      expect(fandomEnCcg.narutopedia.notReplacements).toContain(
        "Naruto x Boruto Card Game",
      );
    });

    it("does not scrape Coleka holo type _t58531 or puja39 TG cards", () => {
      expect(colekaHoloType.scrape).toBe(false);
      expect(colekaHoloType.kind).toBe("type-filter");
      expect(colekaHoloType.url).toContain("_t58531");
      expect(coleka.types.holo).toBe(colekaHoloType.url);
      expect(puja39.ingest).toBe("none");
      expect(puja39.crawl).toBe(false);
      expect(puja39.kind).toBe("fan-custom-cards");
      expect(
        puja39.folders.find((row) => row.name === "Naruto TG Cards")?.count,
      ).toBe(1110);
      expect(aventurasAventurescas7.ingest).toBe("none");
      expect(aventurasAventurescas7.sameAs).toBe("puja39-deviantart.json");
      expect(aventurasAventurescas7.onPageExamples).toBe(16);
      expect(aventurasAventurescas7.userDownloaded).toBe(15);
      expect(aventurasAventurescas7.missingOnPageExample).toContain("sakura");
      expect(aventurasAventurescas7.deadMirrors.live).toBe("404");
      expect(aventurasAventurescas7.sample.not).toContain("n1118");
    });

    it("indexes r/Narutoccg research threads without crawling", () => {
      expect(redditNarutoccg.ingest).toBe("none");
      expect(redditNarutoccg.crawl).toBe(false);
      expect(redditNarutoccg.access.archiveApi).toContain("arctic-shift");
      const rules = redditNarutoccg.threads.find((row) => row.id === "1vjw5hb");
      expect(rules?.kind).toBe("rules");
      expect(rules?.cited).toMatchObject({
        printed: "N-1080",
        diskHint: "n1080",
      });
      expect(rules?.ingestPhoto).toBe(false);
      const amigo = redditNarutoccg.threads.find((row) => row.id === "1ucmepn");
      expect(amigo?.line).toBe("carddass-eu-amigo");
      expect(amigo?.visual?.logo).toContain("Amigo");
      const deSale = redditNarutoccg.threads.find((row) => row.id === "1vk1j0c");
      expect(deSale?.attests?.[0]).toMatchObject({
        ref: "PR-095",
        deNamePrinted: "Naruto Uzumaki",
      });
      const psa = redditNarutoccg.threads.find((row) => row.id === "1v67qcf");
      expect(psa?.attests?.[0]).toMatchObject({
        variant: expect.stringMatching(/Europe/i),
      });
      const pr096de = redditNarutoccg.threads.find((row) => row.id === "ugdgqq");
      expect(pr096de?.attests?.some((a) => a.ref === "PR-096")).toBe(true);
      expect(redditNarutoccg.stillWanted.some((s) => s.startsWith("inventory-sheets"))).toBe(
        true,
      );
      expect(redditNarutoccg["findings2026-08-26"].pr096De).toContain("foil");
    });

    it("does not scrape Primal marketplace or store PTHN-001 as a disk id", () => {
      expect(primalMarketplace.ingest).toBe("none");
      expect(primalMarketplace.crawl).toBe(false);
      expect(primalMarketplace.line).toBe("en-ccg");
      expect(primalMarketplace.urls.browse).toBe(
        "https://marketplace.primaltcg.com/browse/naruto-ccg",
      );
      expect(primalMarketplace.catalog.setCount).toBe(33);
      expect(primalMarketplace.catalog.servedPixels).toEqual({
        width: 350,
        height: 490,
      });
      expect(primalMarketplace.catalog.listingsWithSlug).toBe(0);
      expect(primalMarketplace.catalog.shinobisDream).toBe(false);
      expect(primalMarketplace.sample).toMatchObject({
        shopRef: "PTHN-001",
        printed: "N-001",
        diskHint: "n001",
      });
      expect(primalMarketplace.sample.not).toContain("pthn001");
      expect(parseTcdbNarutoRef(primalMarketplace.sample.shopRef)?.number).toBe(
        "n001",
      );
      expect(primalMarketplace.traps.promotionalCardsGrabBag).toBe(194);
      expect(primalMarketplace.not).toContain("primal-tcg-faces");
    });

    it("does not scrape Collectors Comet or file N-001 as Carddass", () => {
      expect(collectorsComet.ingest).toBe("titles");
      expect(collectorsComet.crawl).toBe(false);
      expect(collectorsComet.line).toBe("en-ccg");
      expect(collectorsComet.urls.browse).toBe(
        "https://collectorscomet.com/Naruto%20CCG",
      );
      expect(collectorsComet.system.editions).toBe(33);
      expect(collectorsComet.system.s1Cards).toBe(127);
      expect(collectorsComet.servedPixels).toEqual({ width: 750, height: 1050 });
      expect(collectorsComet.sample).toMatchObject({
        printed: "N-001",
        diskHint: "n0001",
      });
      expect(narutoDiskCardId(collectorsComet.sample.printed)).toBe("n0001");
      expect(collectorsComet.sample.not).toContain("ni0001");
      expect(collectorsComet.traps.promoGrabBag).toBe(142);
      expect(collectorsComet.traps.promoIconReusesS1Packshot).toBe(true);
      expect(collectorsComet.not).toContain("duel-masters");
    });

    it("does not download the Naruto CCG companion APK or ingest set 29", () => {
      expect(narutoCcgApp.ingest).toBe("none");
      expect(narutoCcgApp.crawl).toBe(false);
      expect(narutoCcgApp.downloadApk).toBe(false);
      expect(narutoCcgApp.line).toBe("en-ccg");
      expect(narutoCcgApp.urls.medium).toContain("bd7e9a09ccd9");
      expect(narutoCcgApp.urls.apkpure).toContain("com.narutoapp");
      expect(narutoCcgApp.android.playStore).toBe("404");
      expect(narutoCcgApp.android.claimedSets).toBe("1-29");
      expect(narutoCcgApp.ios.bundleId).toBe("com.Dattebayo-Labs.NarutoCCG");
      expect(narutoCcgApp.medium.deckThreshold).toBe(50);
      expect(narutoCcgApp.traps.unofficialSet29).toBe(true);
      expect(narutoCcgApp.sameAuthorAs).toContain("primal-tcg-marketplace.json");
      expect(narutoCcgApp.not).toContain("apk-faces");
    });

    it("archives Fansets and may copy them as last-rank fallback onto existing cards", () => {
      expect(narutoCcgFansetsDrive.ingest).toBe("staging+fallback-faces");
      expect(narutoCcgFansetsDrive.crawl).toBe(false);
      expect(narutoCcgFansetsDrive.download).toBe(true);
      expect(narutoCcgFansetsDrive.kind).toBe("fan-custom-cards");
      expect(narutoCcgFansetsDrive.folderId).toBe(
        "1tq0OWmtvZ4Slh8ZlDBEx51uLZUcqnh-T",
      );
      expect(narutoCcgFansetsDrive.folderCount).toBe(8);
      expect(narutoCcgFansetsDrive.folders).toContain(
        "Set 29 - Shinobi's Dreams (Fan Made - Mardo)",
      );
      expect(narutoCcgFansetsDrive.folders).toContain(
        "Set 31 - Silent Humming (Fan Made)",
      );
      expect(narutoCcgFansetsDrive.not).toContain("bandai-s1-s28");
      expect(narutoCcgFansetsDrive.related).toContain("band-of-the-hawk.json");
    });

    it("archives the full Drive hub to staging and promotes official Enhanced as Bandai", () => {
      expect(narutoCcgDrive.ingest).toBe("staging+faces");
      expect(narutoCcgDrive.crawl).toBe(false);
      expect(narutoCcgDrive.download).toBe(true);
      expect(narutoCcgDrive.lang).toBe("en");
      expect(narutoCcgDrive.folderId).toBe("1PbZ0xYY94xeBNvrUb-Bbr35ZSAzEeBI7");
      expect(narutoCcgDrive.cardDatabase.fansetsId).toBe(
        narutoCcgFansetsDrive.folderId,
      );
      expect(narutoCcgDrive.cardDatabase.enhanced.boosters).toBe(28);
      expect(narutoCcgDrive.cardDatabase.enhanced.ingest).toBe("faces");
      expect(narutoCcgDrive.cardDatabase.enhanced.s1Title).toBe(
        "Set 1 - Path of the Hokage",
      );
      expect(narutoCcgDrive.traps.nestsFansets).toBe(true);
      expect(narutoCcgDrive.not).toContain("fansets-as-bandai");
    });

    it("keeps Brasil Storm 3 post traps (PR-032 / YouTube / PR-060)", () => {
      expect(enCcgSeries.storm3Post.claimedIneditePromo).toBe("PR-032");
      expect(enCcgSeries.storm3Post.youtubeBoxOpening).toBe("DCpEW7hH5qA");
      expect(enCcgSeries.sidebarPromo.ref).toBe("PR-060");
      expect(enCcgSeries.printedAlsoSeen).toContain("C-035");
    });

    it("keeps the collector's French CCG copies (UNS3 promos ≠ s28 booster)", () => {
      expect(physical.sameSleeveEnFr).toBe(true);
      expect(physical.legalLineIsNotPrintYear).toBe(true);
      const goku = physical.prints.find((row) => row.ref === "PR-095");
      const hokage = physical.prints.find((row) => row.ref === "PR-096");
      const cloak = physical.prints.find((row) => row.ref === "PR-100");
      const kisame = physical.prints.find((row) => row.ref === "1650");
      expect(goku).toMatchObject({
        notBoosterS28: true,
        namePrinted: "Naruto Uzumaki",
        frEffect: "ENTRAÎNEMENT UNIQUE",
        faceFr: "ebay-115771696619 photo 2/7",
        channel: "Day One / EURO Edition",
      });
      expect(hokage).toMatchObject({
        notBoosterS28: true,
        password: "5CBNQ9W86S",
        inCardsIndex: true,
        faceFr: "leboncoin + duopack window",
        effectName: "SAUVEUR DE KONOHA",
      });
      expect(cloak).toMatchObject({
        notBoosterS28: true,
        effectName: "ASPIRATIONS",
        faceFr: "goat french foil CDN",
        channel: "UNS3 EU promo (Goat French Foil)",
      });
      expect(kisame?.printKeyHint).toBe("naruto:n-1650");
      expect(kisame?.password).toBe("9EHS44A9ST");
      expect(kisame?.printedAlso).toBe("52B");
    });

    it("keeps Coleka S6 IT on _r41388, not the umbrella or FR Carddass branch", () => {
      expect(colekaS6It.listing.scrape).toBe(true);
      expect(colekaS6It.listing.url).toContain("_r41388");
      expect(colekaS6It.listing.lang).toBe("it");
      expect(colekaS6It.listing.disk).toBe("cards/s6/it/");
      expect(colekaS6It.printedTactiquePrefix).toBe("ST");
      expect(colekaS6It.diskTactiquePrefix).toBe("ta");
      expect(colekaS6It.umbrella.scrape).toBe(false);
      expect(colekaS6It.frenchBranch.scrape).toBe(false);
    });

    it("keeps Coleka US promos _r38199 as EN CCG, not the 7000-card umbrella", () => {
      expect(colekaUsPromos.listing.scrape).toBe(true);
      expect(colekaUsPromos.listing.count).toBe(101);
      expect(colekaUsPromos.listing.url).toContain("_r38199");
      expect(colekaUsPromos.listing.lang).toBe("en");
      expect(colekaUsPromos.listing.set).toBe("promo");
      expect(colekaUsPromos.umbrella.scrape).toBe(false);
      expect(colekaUsPromos.pr096).toMatchObject({
        printedRef: "PR-096",
        lang: "en",
        name: "The 4th Hokage",
      });
      expect(colekaUsPromos.pr096.page).toContain("_i1624567");
    });

    it("pastes the French PR-096 Leboncoin photo without crawling the seller", () => {
      expect(leboncoin.ingestCollection).toBe(false);
      expect(leboncoin.faces[0]).toMatchObject({
        printedRef: "PR-096",
        lang: "fr",
        ingest: true,
      });
      expect(leboncoin.faces[0]?.listing).toContain("3233037633");
    });

    it("keeps Coleka umbrella vs série-24 listing vs existing display-s24", () => {
      expect(colekaS24.umbrella.scrape).toBe(false);
      expect(colekaS24.umbrella.url).toContain("_r4102");
      expect(colekaS24.listing.url).toContain("_r15466");
      expect(colekaS24.listing.scrape).toBe(true);
      expect(colekaS24.listing.lang).toBe("fr");
      expect(colekaS24.listing.set).toBe("s24");
      expect(colekaS24.listing.announced).toBe(121);
      expect(colekaS24.listing.enumerated).toBe(120);
      expect(colekaS24.displayPackshot.sku).toBe("display-s24");
      expect(colekaS24.ingestFaces).toBe("s24/fr");
    });

    it("keeps Coleka umbrella vs série-28 listing vs display packshot", () => {
      expect(colekaS28.umbrella.scrape).toBe(false);
      expect(colekaS28.umbrella.url).toContain("_r4102");
      expect(colekaS28.listing.url).toContain("_r16649");
      expect(colekaS28.listing.scrape).toBe(true);
      expect(colekaS28.displayPackshot.sku).toBe("display-s28");
      expect(colekaS28.displayPackshot.url).toContain(
        "carte-naruto-serie-28.webp",
      );
    });

    it("indexes every URL pasted in chat today", () => {
      const urls = chatLinks.links.map((row) => row.url);
      expect(urls).toContain(
        "https://www.coleka.com/fr/cartes-de-collection/cartes-anime-manga/naruto-cartes-a-jouer-et-a-collectionner_r4102",
      );
      expect(urls).toContain("https://payhip.com/BandoftheHawkCardShop");
      expect(urls).toContain("https://www.lorcards.fr/");
      expect(urls).toContain("https://www.pkmcards.fr/");
      expect(urls).toContain(
        "https://www.tcdb.com/ViewAll.cfm/sp/Gaming?Let=N&MODE=Years",
      );
      expect(urls).toContain(
        "https://thumbs.coleka.com/media/rubrique/202411/15/cartes-de-collection-cartes-anime-manga-naruto-cartes-a-jouer-et-a-collectionner-naruto-carddass-series-francaises.webp",
      );
      expect(urls).toContain(
        "https://vialudibunda.com/media/catalog/product/n/a/naruto-serie-1-booster.jpg",
      );
      expect(urls).toContain(
        "https://vialudibunda.com/media/catalog/product/n/a/naruto-serie-1-deck-pays-du-vent.jpg",
      );
      expect(urls).toContain(
        "https://i.ebayimg.com/images/g/XvQAAOSwOR5nAWTW/s-l1600.webp",
      );
      expect(urls).toContain(
        "https://www.manga-news.com/index.php/collection/TCG-Naruto",
      );
      expect(urls.some((url) => url.includes("700x700"))).toBe(false);
      expect(mangaNewsPackshots.skip[0]?.setCode).toBe("s24");
      expect(ebay.products[0]?.slug).toBe("booster-s2");
      expect(vialudibunda.products.map((row) => row.slug)).toEqual([
        "booster-s1",
        "starter-pays-du-vent",
        "starter-maitre-hokage",
      ]);
      expect(urls).toContain(
        "https://trictrac.net/jeu-de-societe/naruto-jcc-serie-1",
      );
      expect(urls).toContain(
        "https://trictrac.net/jeu-de-societe/naruto-jcc-serie-2",
      );
      expect(urls).toContain(
        "https://trictrac.net/jeu-de-societe/naruto-jcc-serie-3",
      );
      expect(urls).toContain(
        "https://trictrac.net/jeu-de-societe/naruto-jcc-serie-4",
      );
      expect(trictrac.faces.ingest).toBe("none");
      expect(
        trictrac.products.filter((row) => row.kind === "deck").map((row) => row.slug),
      ).toEqual([
        "starter-pays-du-vent",
        "starter-maitre-hokage",
        "starter-sceller-le-malefice",
        "starter-detruire-konoha",
        "starter-apprentissage",
        "starter-puissances-cachees",
      ]);
      expect(
        trictrac.products.find((row) => row.slug === "tin-box"),
      ).toMatchObject({ kind: "coffret", ingest: true });
      expect(urls).not.toContain(
        "https://thumbs.coleka.com/media/rubrique/202411/15/cartes-de-collection-cartes-anime-manga-naruto-cartes-a-jouer-et-a-collectionner-naruto-carddass-series-francaises_300x300.webp",
      );
      expect(tcdb.nIndex.url).toBe(
        "https://www.tcdb.com/ViewAll.cfm/sp/Gaming?Let=N&MODE=Years",
      );
      expect(urls.some((url) => url.includes("localhost"))).toBe(false);
      expect(urls).toContain(
        "https://gradedcardcenter.com/item/f96806f8-6e60-4dcd-9acd-8592855db527",
      );
      expect(urls).toContain(
        "http://narutozabuza.centerblog.net/14-cartes-naruto",
      );
      expect(urls).toContain("https://www.suruga-ya.com/en/category/501080113");
      expect(urls).toContain("https://www.suruga-ya.jp/product/detail/GL636976");
      // Provider dédié `narutodatacarddass` (2026-09-03) — ledger Suruga = note
      // de chasse ; checklist seed sous le nouveau module. Pas de mint Carddass.
      expect(surugaDataCarddass.ingest).toContain("model-ready");
      expect(surugaDataCarddass.crawl).toBe(false);
      expect(surugaDataCarddass.line).toBe("data-carddass");
      expect(surugaDataCarddass.prefixesSeen).toEqual([
        "DN",
        "NM",
        "NF",
        "NX",
        "DMP",
        "DNP",
        "NC",
        "NFM",
      ]);
      expect(surugaDataCarddass.listed).toBe(108);
      expect(surugaDataCarddass.not).toContain("carddass");
      expect(surugaDataCarddass.not).toContain("en-ccg");
      expect(surugaDataCarddass.decisionReversed.movedTo).toContain(
        "narutodatacarddass",
      );
      expect(surugaCarddass.ingest).toBe("faces");
      expect(surugaCarddass.line).toBe("carddass-jp");
      expect(surugaCarddass.lang).toBe("ja");
      expect(surugaCarddass.sampleProduct).toContain("GL636976");
      expect(surugaCarddass.not).toContain("data-carddass");
      expect(surugaCarddass.listed).toBe(1216);
      expect(urls).toContain(
        "https://www.slab-z.com/post/the-definitive-2002-naruto-card-game-vintage-guide-rookies-grails",
      );
      expect(slabZ2002.ingest).toBe("none");
      expect(slabZ2002.titleIngest).toBe("rookiesClaimed");
      expect(slabZ2002.line).toBe("carddass-jp");
      expect(slabZ2002.game.set).toBe("巻ノ壱");
      expect(slabZ2002.promos.prNin1.printedRef).toBe("PR忍-1");
      expect(slabZ2002.promos.prNin1R.printedRef).toBe("PR忍-1-R");
      expect(slabZ2002.notTcg).toHaveLength(2);
      expect(urls).toContain(
        "https://neokyo.com/blog/naruto-cards-guide-rare-valuable-cards-and-how-to-identify-them/",
      );
      expect(neokyoGuide.ingest).toBe("none");
      expect(neokyoGuide.falseClaims).toContain("not-a-tcg");
      expect(neokyoGuide.falseClaims).toContain("japan-only");
      expect(urls).toContain(
        "https://naruto.fandom.com/wiki/Naruto_Collectible_Card_Game",
      );
      expect(urls).toContain("https://narutocarddass.fandom.com/wiki/Naruto_CCG_wiki");
      expect(fandomEnCcg.ingest).toBe("none");
      expect(fandomEnCcg.crawl).toBe(false);
      expect(fandomEnCcg.line).toBe("en-ccg");
      expect(fandomEnCcg.narutopedia.setListPaste).toHaveLength(31);
      expect(fandomEnCcg.narutopedia.setListPaste[12]).toBe("Faithful Reunion");
      expect(fandomEnCcg.narutopedia.setListPaste[23]).toBe("Kage Summit");
      expect(fandomEnCcg.narutopedia.setListPaste).not.toContain("Sage's Legacy");
      expect(fandomEnCcg.narutopedia.setListPaste).not.toContain(
        "Fateful Reunion",
      );
      expect(
        fandomEnCcg.narutopedia.setListErrors.some((row) => row.includes("s24")),
      ).toBe(true);
      expect(fandomEnCcg.fanWiki.inventedPrefixes).toContain("PTHN-001");
      expect(fandomEnCcg.fanWiki.sample.diskHint).toBe("n001");
      expect(fandomEnCcg.fanWiki.sample.not).toContain("pthn001");
      expect(urls).toContain("https://www.carddas.com/naruto/");
      expect(urls).toContain(
        "http://www.tradecardsonline.com/im/selectCard/game_id/48",
      );
      expect(tradecardsonline.ingest).toBe("none");
      expect(tradecardsonline.crawlLive).toBe(false);
      expect(tradecardsonline.wayback.htmlThisSession).toBe(true);
      expect(tradecardsonline.series2008).toHaveLength(11);
      expect(tradecardsonline.gameId).toBe(48);
      expect(tradecardsonline.line).toBe("en-ccg");
      expect(tradecardsonline.live.status).toBe("shutdown");
      expect(tradecardsonline.related.dreamCards).toContain("goal/DC");
      expect(tradecardsonline.not).toContain("ta081-locales");
      expect(carddasCom.ingest).toBe("none");
      expect(carddasCom.crawlLive).toBe(false);
      expect(carddasCom.line).toBe("carddass-jp");
      expect(carddasCom.live["www.carddas.com/naruto"]).toBe(404);
      expect(carddasCom.wayback.staging).toBe("staging/carddas-jp/");
      expect(carddasCom.traps[0]?.is).toBe("第五幕 2008");
      expect(carddasCom.officialSite.originalCg.cardlist).toHaveLength(17);
      expect(
        carddasCom.officialSite.shippudenCg.acts.map((row) => row.file),
      ).toEqual(["3rd.shtml", "5th.shtml", "6th.shtml", "8th.shtml"]);
      expect(
        carddasCom.officialSite.shippudenCg.acts.find(
          (row) => row.file === "5th.shtml",
        )?.not,
      ).toContain("maki5");
      expect(carddasCom.officialSite.dataCarddass.scrape).toBe(false);
      expect(carddasCom.officialSite.ingestFaces).toBe("none");
      expect(carddasCom.officialSite.promoteStagingHoles).toBe(true);
      expect(carddasJpCardlist.ingest).toBe("titles");
      expect(carddasJpCardlist.counts.cards).toBe(1010);
      expect(carddasJpCardlist.not).toContain("data-carddass");
      expect(carddasJpPromo.ingest).toBe("titles");
      expect(carddasJpPromo.counts.cards).toBe(61);
      expect(carddasJpPromo.not).toContain("ni001");
      expect(bandaicgEnCardlist.ingest).toBe("titles");
      expect(bandaicgEnCardlist.counts.cards).toBeGreaterThan(1500);
      expect(bandaicgEnCardlist.not).toContain("carddass");
      expect(Object.keys(bandaicgEnCardlist.counts.bySet)).not.toContain("s14");
      expect(cardgameclubItCardlist.ingest).toBe("titles");
      expect(cardgameclubItCardlist.shopCounts).toEqual({
        s1: 183,
        s2: 145,
        s3: 131,
        s4: 139,
        s5: 142,
      });
      expect(cardgameclubItCardlist.counts.cards).toBeLessThan(
        Object.values(cardgameclubItCardlist.shopCounts).reduce(
          (a, b) => a + b,
          0,
        ),
      );
      expect(narutocardsCa.ingest).toBe("titles");
      expect(narutocardsCa.note).toMatch(/N-1715/);
      expect(narutocardsCa.skip).toContain("bandai-ccg-29");
      expect(narutocardsCa.skip).toContain("kayou");
      expect(narutocardsCa.sets.some((row) => row.setCode === "s28")).toBe(true);
      expect(narutocardsCa.sets.some((row) => row.slug === "bandai-ccg-29")).toBe(
        false,
      );
      expect(narutozabuza.ingest).toBe("faces");
      expect(narutozabuza.disk).toBe("cards/promo/prni0001-R/ja/");
      expect(narutozabuza.crawlBlog).toBe(false);
      expect(narutozabuza.print.printedRef).toBe("PR忍-1-R");
      expect(narutozabuza.print.not).toContain("ni180");
      expect(narutozabuza.print.not).toContain("ni001");
      expect(narutozabuza.image.pixels).toEqual({ width: 400, height: 400 });
      expect(urls).toContain(
        "https://goatcardsshop.crystalcommerce.com/catalog/naruto_sealed_product-naruto_ccg_sealed_booster_boxes/3970?sort_by_price=0",
      );
      expect(urls).toContain(
        "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/351974/broken_promise.jpg",
      );
      expect(urls).toContain(
        "https://crystalcommerce-assets.nyc3.cdn.digitaloceanspaces.com/photos/882960/herosascension.jpg",
      );
      expect(urls).toContain(
        "https://boardgamegeek.com/filepage/20590/narutotcglistxls",
      );
      expect(urls.some((url) => url.includes("download_redirect"))).toBe(false);
      expect(bggEnCcgS1.ingest).toBe("titles");
      expect(bggEnCcgS1.counts.cards).toBe(127);
      expect(bggEnCcgS1.set.title).toBe("The Path to Hokage");
    });
  });
}

