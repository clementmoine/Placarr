import { describe, expect, it } from "vitest";

import {
  japaneseReleaseBands,
  japaneseVolumeForNumber,
  listJapaneseReleases,
  japaneseVolumeForPrintNumber,
  overlappingJapaneseBands,
  parseJapaneseNumber,
} from "./japaneseVolumes";

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
