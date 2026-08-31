import { describe, expect, it } from "vitest";

import {
  classifyJapaneseRelease,
  declaredKinds,
  japaneseSealedReleases,
  kanjiVolumeNumber,
} from "./japaneseSealedReleases";

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
    const carddas = rows.filter((r) => r.stagingKind === "carddas-jp");
    expect(carddas.map((r) => r.slug).sort()).toEqual([
      "booster-vol1-jp",
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

  /*
    Là où Bandai ne publie plus, la base de rachat Suruga-ya prend le relais —
    volumes 7 et 9, et la boîte starter 秘技伝授. Le visuel de l'éditeur passe
    avant celui d'un revendeur, d'où deux sources distinctes plutôt qu'un
    mélange.
  */
  it("complète avec Suruga là où l'éditeur ne publie plus", () => {
    const suruga = rows.filter((r) => r.stagingKind === "suruga-kaitori");
    expect(suruga.map((r) => r.slug).sort()).toEqual([
      "booster-vol7-jp",
      "booster-vol9-jp",
      "jp-release-04",
    ]);
    expect(suruga.every((r) => r.stagingFile === `${r.slug}.webp`)).toBe(true);
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
