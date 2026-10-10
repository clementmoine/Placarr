import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import dig_kanaMangaBlister2008 from "../curated/sources/kana-manga-blister-2008.json";
import dig_rakutenTinBoxHobby from "../curated/sources/rakuten-tin-box-hobby-2026-08-30.json";
import dig from "../curated/sources/tin-box-hobby-sleeve-2026-08-30.json";
import { narutoCuratedProductsDir } from "../install/curated";
import { productSourceFromStagingRel } from "../productChoice";
import { NARUTO_SEALED_SKUS } from "../sealed";
import { rakutenIngestPackshots } from "./packshots";
import { germanSealedReleases, germanSetCode, classifyJapaneseRelease, declaredKinds, japaneseSealedReleases, kanjiVolumeNumber, japaneseReleaseBands, japaneseVolumeForNumber, listJapaneseReleases, japaneseVolumeForPrintNumber, overlappingJapaneseBands, parseJapaneseNumber } from "./sealed";

// —— germanSealedReleases ——
{
  describe("germanSetCode", () => {
    it("lit la série dans le slug", () => {
      expect(germanSetCode("booster-s4-de")).toBe("s4");
      expect(germanSetCode("display-s3-de")).toBe("s3");
      expect(germanSetCode("booster-s9-de")).toBe("s9");
    });

    it("ne se déclenche pas sur un slug d'une autre langue", () => {
      expect(germanSetCode("booster-s1-it")).toBeNull();
      expect(germanSetCode("booster-s1")).toBeNull();
    });
  });

  describe("germanSealedReleases", () => {
    const rows = germanSealedReleases();

    /*
      Le catalogue ne portait **rien** en allemand — ni carte, ni produit — alors
      que la ligne existe : neuf séries de boosters, plus au moins un display.
    */
    it("rend les neuf boosters et le display", () => {
      expect(rows).toHaveLength(10);
      expect(rows.filter((r) => r.kind === "booster")).toHaveLength(9);
      expect(rows.filter((r) => r.kind === "display")).toHaveLength(1);
      expect(rows.every((r) => r.lang === "DE" && r.attested)).toBe(true);
    });

    it("donne au display son propre nom, pas celui du booster", () => {
      // La page servait le même `og:title` pour les deux.
      const display = rows.find((r) => r.kind === "display");
      expect(display?.name).toBe("Display Série 3");
      expect(display?.slug).toBe("display-s3-de");
      expect(rows.find((r) => r.slug === "booster-s1-de")?.name).toBe(
        "Booster Série 1",
      );
    });

    it("nomme un fichier de staging par SKU, sans collision", () => {
      expect(rows.every((r) => r.stagingFile === `${r.slug}.png`)).toBe(true);
      expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
    });
  });
}

// —— japaneseSealedReleases ——
{
  describe("kanjiVolumeNumber", () => {
    it("lit les dix-sept volumes, unités et dizaines", () => {
      expect(kanjiVolumeNumber("巻ノ一")).toBe(1);
      expect(kanjiVolumeNumber("巻ノ五 実力伯仲!予選死闘編")).toBe(5);
      expect(kanjiVolumeNumber("巻ノ十 受け継ぎ託すもの編")).toBe(10);
      expect(kanjiVolumeNumber("巻ノ十一 結成!木ノ葉小隊編")).toBe(11);
      expect(kanjiVolumeNumber("巻ノ十七 雄き獣の島編")).toBe(17);
    });

    it("ne voit pas de volume là où il n'y en a pas", () => {
      expect(kanjiVolumeNumber("秘技伝授スターターボックス")).toBeNull();
      expect(kanjiVolumeNumber("コイン PLUS")).toBeNull();
    });
  });

  describe("declaredKinds", () => {
    it("lit le nombre de cartes différentes annoncé", () => {
      expect(declaredKinds("70+P")).toBe(70);
      expect(declaredKinds("18 new")).toBe(18);
      expect(declaredKinds("57+P")).toBe(57);
    });

    it("refuse de chiffrer ce que la source laisse ouvert", () => {
      // `unconfirmed` et `18+` ne sont pas des comptes : inventer un nombre ici
      // ferait dire au catalogue une chose que le relevé se garde de dire.
      expect(declaredKinds("unconfirmed")).toBeNull();
      expect(declaredKinds("18+")).toBeNull();
      expect(declaredKinds(undefined)).toBeNull();
    });
  });

  describe("classifyJapaneseRelease", () => {
    it("classe par le vocabulaire de la sortie, pas par son rang", () => {
      expect(classifyJapaneseRelease({ name: "巻ノ三 挑戦者集結!編" })).toBe(
        "booster",
      );
      expect(
        classifyJapaneseRelease({ name: "秘技伝授スターターボックス" }),
      ).toBe("deck");
      expect(
        classifyJapaneseRelease({ name: "BEST SELECT BOOSTER 忍兵法札絵巻" }),
      ).toBe("booster");
      // Feuilles jumbo, boîtes, coins, cartes-bonbon : `kind` n'a pas de case
      // pour eux, `coffret` est le fourre-tout assumé.
      expect(
        classifyJapaneseRelease({
          name: "拡張シート 極意忍法帖",
          format: "jumbo",
        }),
      ).toBe("coffret");
      expect(classifyJapaneseRelease({ name: "コイン PLUS" })).toBe("coffret");
    });
  });

  describe("japaneseSealedReleases", () => {
    const rows = japaneseSealedReleases();

    it("rend les trente sorties du relevé", () => {
      expect(rows).toHaveLength(30);
      expect(rows.every((r) => r.attested)).toBe(true);
      expect(rows.every((r) => r.lang === "JA")).toBe(true);
    });

    it("numérote les volumes comme le SKU déjà écrit à la main", () => {
      const vol5 = rows.find((r) => r.slug === "booster-vol5-jp");
      expect(vol5?.setCode).toBe("maki5");
      expect(rows.filter((r) => /^booster-vol\d+-jp$/.test(r.slug))).toHaveLength(
        17,
      );
    });

    it("ne confond pas taille du set et cartes par sachet", () => {
      // `70+P` dit 70 cartes *différentes* dans 巻ノ一, pas 70 par paquet.
      const vol1 = rows.find((r) => r.slug === "booster-vol1-jp");
      expect(vol1?.setKinds).toBe(70);
      expect(vol1?.declaredCardCount).toBeNull();
    });

    it("garde la date de sortie quand le relevé la donne", () => {
      expect(rows.find((r) => r.slug === "booster-vol1-jp")?.released).toBe(
        "2002-12",
      );
      expect(rows.find((r) => r.slug === "booster-vol17-jp")?.released).toBe(
        "2006-09-08",
      );
    });

    it("donne un slug stable aux sorties sans numéro de volume", () => {
      const starter = rows.find((r) => r.name.includes("スターターボックス"));
      expect(starter?.slug).toMatch(/^jp-release-\d{2}$/);
      expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
    });
  });

  describe("les visuels officiels Bandai", () => {
    const rows = japaneseSealedReleases();

    /*
      `sec.carddass.com` ne remonte pas jusqu'au début de la ligne : sur les
      dix-sept volumes, trois seulement gardent une fiche montrant un emballage.
      Les autres passent par le site de jeu ou restent sans image, ce qui est le
      comportement voulu — pas un échec.
    */
    it("pose le visuel Bandai sur les volumes dont la fiche montre un emballage", () => {
      const official = rows.filter((r) => r.stagingKind === "carddass-official");
      expect(official.map((r) => r.slug).sort()).toEqual([
        "booster-vol12-jp",
        "booster-vol16-jp",
        "booster-vol17-jp",
      ]);
      expect(official.every((r) => r.stagingFile === `${r.slug}.jpg`)).toBe(true);
    });

    /*
      Le 巻ノ四 est le contre-exemple : sa fiche officielle illustre le produit
      par six cartes étalées, sans le moindre emballage. Un SKU de type booster
      doit montrer son sachet, alors la grande image cède au petit packshot du
      site de jeu — 560×560 contre 75×144.
    */
    it("préfère le sachet du site de jeu à la planche de cartes officielle", () => {
      const vol4 = rows.find((r) => r.slug === "booster-vol4-jp");
      expect(vol4?.stagingKind).toBe("carddas-jp");
      expect(vol4?.stagingFile).toBe("image/product/4nd.gif");
    });

    /*
      Le miroir Wayback de carddas.com est la seule source connue pour les
      sachets des volumes 2, 3, 13, 14 et 15 — ils n'avaient aucun visuel.
      `15/pac.gif` garde son dossier : le site rangeait les derniers volumes
      ainsi, et aplatir le chemin ne retrouverait pas le fichier.
    */
    it("comble avec le site de jeu les volumes que personne d'autre ne montre", () => {
      const carddasPrimary = rows.filter((r) => r.stagingKind === "carddas-jp");
      expect(carddasPrimary.map((r) => r.slug).sort()).toEqual([
        "booster-vol1-jp",
        "booster-vol10-jp",
        "booster-vol11-jp",
        "booster-vol13-jp",
        "booster-vol14-jp",
        "booster-vol15-jp",
        "booster-vol2-jp",
        "booster-vol3-jp",
        "booster-vol4-jp",
        "booster-vol5-jp",
        "jp-release-07",
        "jp-release-12",
        "jp-release-18",
        "jp-release-21",
        "jp-release-23",
        "jp-release-25",
        "jp-release-27",
        "jp-release-29",
      ]);
      expect(rows.find((r) => r.slug === "booster-vol15-jp")?.stagingFile).toBe(
        "image/product/15/pac.gif",
      );
      expect(rows.find((r) => r.slug === "booster-vol1-jp")?.stagingFile).toBe(
        "image/new/1st_pac.gif",
      );
      expect(rows.find((r) => r.slug === "jp-release-07")?.stagingFile).toBe(
        "image/new/gokui.gif",
      );
    });

    it("complète avec Suruga là où l'éditeur ne publie plus", () => {
      const suruga = rows.filter((r) => r.stagingKind === "suruga-kaitori");
      expect(suruga.map((r) => r.slug).sort()).toEqual([
        "booster-vol7-jp",
        "booster-vol9-jp",
        "jp-release-04",
      ]);
      expect(suruga.every((r) => r.stagingFile === `${r.slug}.webp`)).toBe(true);
    });

    it("garde carddas + TV Tokyo en dumps parallèles même quand Suruga est primaire", () => {
      const vol7 = rows.find((r) => r.slug === "booster-vol7-jp");
      expect(vol7?.stagingKind).toBe("suruga-kaitori");
      expect(vol7?.packshots?.map((p) => p.kind)).toEqual([
        "suruga-kaitori",
        "carddas-jp",
        "tv-tokyo",
      ]);
      const vol6 = rows.find((r) => r.slug === "booster-vol6-jp");
      expect(vol6?.stagingKind).toBe("jp-boosters");
      expect(vol6?.packshots?.map((p) => p.kind)).toEqual([
        "jp-boosters",
        "carddas-jp",
        "tv-tokyo",
      ]);
    });

    it("laisse ラムネ / Vジャンプ / 絵巻 弐 sans visuel plutôt que d'en inventer un", () => {
      for (const slug of [
        "jp-release-15",
        "jp-release-17",
        "jp-release-20",
      ] as const) {
        const row = rows.find((r) => r.slug === slug);
        expect(row?.stagingFile).toBeUndefined();
        expect(row?.attested).toBe(true);
      }
    });
  });
}

// —— japaneseVolumes ——
{
  describe("parseJapaneseNumber", () => {
    it("lit la famille et le numéro", () => {
      expect(parseJapaneseNumber("ni0041")).toEqual({ family: "ni", number: 41 });
      expect(parseJapaneseNumber("ta0337")).toEqual({
        family: "ta",
        number: 337,
      });
    });

    /*
      Seules cinq familles sont numérotées par le registre. `shi`, `mju`, `gaku`
      et les préfixes de promo ont leur propre logique — les faire passer ici
      leur donnerait un volume qui n'existe pas.
    */
    it("refuse les familles que le registre ne numérote pas", () => {
      expect(parseJapaneseNumber("shi0132")).toBeNull();
      expect(parseJapaneseNumber("prni0004")).toBeNull();
      expect(parseJapaneseNumber("c0001")).toBeNull();
    });
  });

  describe("japaneseVolumeForNumber", () => {
    /*
      Les bornes exactes du registre : 巻ノ一 ouvre 忍1-24, le 巻ノ二 prend la
      suite à 25. Tester les bords vaut mieux que tester un milieu, une erreur
      de comparaison ne se voit qu'aux extrémités.
    */
    it("range les 忍 dans leur volume, bornes comprises", () => {
      expect(japaneseVolumeForNumber("ni", 1)?.setCode).toBe("maki1");
      expect(japaneseVolumeForNumber("ni", 24)?.setCode).toBe("maki1");
      expect(japaneseVolumeForNumber("ni", 25)?.setCode).toBe("maki2");
      expect(japaneseVolumeForNumber("ni", 417)?.setCode).toBe("maki17");
    });

    it("garde le libellé japonais de la sortie", () => {
      expect(japaneseVolumeForNumber("ni", 1)).toMatchObject({
        setCode: "maki1",
        releaseName: "巻ノ一",
        volume: 1,
      });
      expect(japaneseVolumeForNumber("ni", 30)?.releaseName).toBe(
        "巻ノ二 鬼人!再不斬編",
      );
    });

    /*
      Toutes les sorties ne sont pas des 巻ノ. La スターターボックス a frappé
      ses propres numéros ; elle range donc ses cartes sous son slug, pas sous un
      volume inventé.
    */
    it("range aussi les sorties qui ne sont pas des volumes", () => {
      const box = japaneseVolumeForNumber("ni", 61);
      expect(box?.volume).toBeNull();
      expect(box?.releaseName).toBe("秘技伝授スターターボックス");
      expect(box?.setCode).toMatch(/^jp-release-\d+$/);
    });

    /*
      Le registre ne couvre que la ligne numérotée. Hors plage, on ne répond pas
      — une promo ou un trou du relevé ne doit pas hériter du volume voisin.
    */
    it("rend null hors plage plutôt que d'inventer", () => {
      expect(japaneseVolumeForNumber("ni", 9999)).toBeNull();
      expect(japaneseVolumeForNumber("ki", 9)).toBeNull();
    });

    it("lit aussi le numéro tel qu'il est stocké", () => {
      expect(japaneseVolumeForPrintNumber("ni0001")?.setCode).toBe("maki1");
      expect(japaneseVolumeForPrintNumber("shi0132")).toBeNull();
    });
  });

  describe("ce que la source ne tranche pas", () => {
    /*
      Écarter le 忍兵法札絵巻 弐 supprime la réimpression 忍-230〜233, mais il
      reste une vraie contradiction du registre : 巻ノ十 annonce « 80+P » pour
      81 cartes, 巻ノ十一 « 57+P » pour exactement 57. Chacun tient debout seul ;
      ensemble ils réclament 56 numéros 忍 pour les 50 places de 205 à 254.
    */
    it("ne garde qu'un seul recouvrement, et c'est celui des volumes 10 et 11", () => {
      const bands = overlappingJapaneseBands();
      expect(bands).toHaveLength(1);
      expect(bands[0]).toMatchObject({ family: "ni", from: 234, to: 239 });
    });

    /*
      Six cartes sans volume valent mieux que six cartes rangées dans le mauvais.
      Les bords immédiats, eux, restent attribués : l'abstention est bornée à ce
      que la source conteste vraiment.
    */
    it("laisse les numéros contestés sans volume plutôt que de choisir", () => {
      for (let n = 234; n <= 239; n += 1) {
        expect(japaneseVolumeForNumber("ni", n)).toBeNull();
      }
      expect(japaneseVolumeForNumber("ni", 233)?.setCode).toBe("maki10");
      expect(japaneseVolumeForNumber("ni", 240)?.setCode).toBe("maki11");
    });

    /*
      La contestation est propre à la famille : 術-234 n'est disputé par
      personne, et l'abstention sur les 忍 ne doit pas déborder sur lui.
    */
    it("n'étend pas l'abstention aux autres familles", () => {
      expect(japaneseVolumeForNumber("te", 234)).not.toBeNull();
    });
  });

  /*
    Le catalogue range selon la découpe **européenne** parce que c'est ce que
    donnent ses sources. La découpe japonaise ne peut pas y être écrite : il n'y a
    qu'une colonne `set_code`, et 766 tirages sur 935 portent à la fois un titre
    japonais et un titre français — les forcer en `maki*` les sortirait de leur
    série européenne. Elle se calcule donc, ce qui ne coûte rien : la famille et
    le numéro imprimé la déterminent entièrement.
  */
  describe("la découpe japonaise se calcule, elle ne se range pas", () => {
    it("lists the seventeen volumes and the releases between them", () => {
      const releases = listJapaneseReleases();
      const volumes = releases.filter((r) => r.volume != null);
      expect(volumes).toHaveLength(17);
      expect(volumes.map((r) => r.setCode)).toContain("maki1");
      expect(volumes.map((r) => r.setCode)).toContain("maki17");
      // Boîtes, feuilles d'extension, Coin — des sorties, pas des volumes.
      expect(releases.length).toBeGreaterThan(17);
    });

    it("turns a volume into the number ranges that define it", () => {
      expect(japaneseReleaseBands("maki10")).toEqual([
        { family: "ni", from: 205, to: 239 },
        { family: "te", from: 192, to: 211 },
        { family: "ta", from: 191, to: 213 },
        { family: "cl", from: 27, to: 29 },
      ]);
    });

    /*
      Le 巻ノ十 couvre 忍-205〜239, le 巻ノ十一 démarre à 忍-234 : la source se
      contredit sur six numéros. Ils restent sans volume plutôt que d'être
      attribués au hasard — voir `contestedJapaneseNumbers`.
    */
    it("refuses to pick a side where the source contradicts itself", () => {
      for (const n of [234, 235, 236, 237, 238, 239]) {
        expect(japaneseVolumeForNumber("ni", n)).toBeNull();
      }
      expect(japaneseVolumeForNumber("ni", 233)?.setCode).toBe("maki10");
      expect(japaneseVolumeForNumber("ni", 240)?.setCode).toBe("maki11");
    });

    it("knows nothing of a number outside every band", () => {
      expect(japaneseVolumeForNumber("ni", 9999)).toBeNull();
      expect(japaneseReleaseBands("s1")).toEqual([]);
    });
  });
}

// —— tinBoxHobbySleeve ——
{
  describe("tin-box-hobby sleeve packshot", () => {
    it("keeps the curated blue sleeve as the Hobby catalogue face", () => {
      expect(dig.slug).toBe("tin-box-hobby");
      expect(dig.ingest).toContain("wrappers/tin-box-hobby.png");
      expect(
        existsSync(
          path.join(narutoCuratedProductsDir(), "wrappers", "tin-box-hobby.png"),
        ),
      ).toBe(true);
      expect(NARUTO_SEALED_SKUS.find((row) => row.slug === "tin-box-hobby")).toMatchObject({
        stagingFile: "tin-box-hobby.png",
        stagingKind: "wrappers",
        name: "Tin Box Hobby",
      });
    });
  });
}

// —— rakutenTinBoxHobby ——
{
  describe("rakuten tin-box-hobby", () => {
    it("keeps Hobby SKU distinct; Rakuten face stays archival", () => {
      expect(dig_rakutenTinBoxHobby.productId).toBe("1962181402");
      expect(dig_rakutenTinBoxHobby.ean).toBeNull();
      expect(dig_rakutenTinBoxHobby.doNot.join(" ")).toMatch(/fusionner/i);
      expect(dig_rakutenTinBoxHobby.doNot.join(" ")).toMatch(/art\.rakuten/i);
      expect(rakutenIngestPackshots()).toEqual([]);
      expect(
        NARUTO_SEALED_SKUS.find((row) => row.slug === "tin-box-hobby"),
      ).toMatchObject({
        stagingFile: "tin-box-hobby.png",
        stagingKind: "wrappers",
        name: "Tin Box Hobby",
      });
      expect(
        NARUTO_SEALED_SKUS.find((row) => row.slug === "tin-box"),
      ).toBeTruthy();
      expect(
        productSourceFromStagingRel(
          "staging/rakuten/tin-box-hobby/01-face.webp",
        ),
      ).toBe("rakuten");
    });
  });
}

// —— kanaMangaBlister2008 ——
{
  describe("Kana manga blister 2008 dig", () => {
    it("confirms the official mangakana announcement via Wayback", () => {
      expect(dig_kanaMangaBlister2008.verdict).toBe("confirmed");
      expect(dig_kanaMangaBlister2008.officialAnnouncement.startDate).toBe("2008-04-25");
      expect(dig_kanaMangaBlister2008.officialAnnouncement.claim).toMatch(/15 premiers tomes/i);
      expect(dig_kanaMangaBlister2008.officialAnnouncement.claim).toMatch(/7 cartes inédites/i);
      expect(dig_kanaMangaBlister2008.officialAnnouncement.wayback).toContain("web.archive.org");
      expect(dig_kanaMangaBlister2008.tomeMapping).toHaveLength(15);
      expect(dig_kanaMangaBlister2008.tomeMapping.filter((row) => row.kind === "inedite")).toHaveLength(
        6,
      );
    });

    it("reads print numbers from collage image filenames on the Kana page", () => {
      expect(dig_kanaMangaBlister2008.collageImages.files.map((row) => row.number).sort()).toEqual([
        "ni232",
        "ni236",
        "ni239",
        "ni240",
        "ni252",
        "ni253",
        "ta214",
        "ta219",
      ]);
      expect(dig_kanaMangaBlister2008.tomeMapping.find((row) => row.tome === 12)).toMatchObject({
        number: "ni240",
        kind: "s5-reprint",
      });
    });
  });
}

