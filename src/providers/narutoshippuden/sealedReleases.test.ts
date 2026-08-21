import { describe, expect, it } from "vitest";

import {
  shippudenAct,
  shippudenFormat,
  shippudenSealedReleases,
} from "./sealedReleases";

describe("shippudenAct", () => {
  it("lit l'acte, en kanji comme en chiffre pleine chasse", () => {
    expect(
      shippudenAct("NARUTO 疾風伝 カードゲーム 第三幕 ～激しき野望～"),
    ).toBe(3);
    expect(shippudenAct("NARUTO 疾風伝 カードゲーム第３幕 第三幕")).toBe(3);
    expect(shippudenAct("NARUTO 疾風伝 カードゲーム 第八幕")).toBe(8);
  });

  it("ne trouve pas d'acte là où il n'y en a pas", () => {
    expect(
      shippudenAct("NARUTO-ナルト- 疾風伝 カードゲーム Coin＋"),
    ).toBeNull();
  });
});

describe("shippudenFormat", () => {
  /*
    `自販機ブースター` contient les deux mots : le distributeur doit être testé
    avant le sachet, sinon tout devient un booster.
  */
  it("distingue le distributeur du sachet, malgré le mot commun", () => {
    expect(shippudenFormat("第八幕 ブースターパック")).toBe("booster");
    expect(shippudenFormat("第八幕 自販機ブースター")).toBe("vending");
    expect(shippudenFormat("第七幕 構築済みスターターセット")).toBe("starter");
    expect(shippudenFormat("カードゲーム Coin＋")).toBe("coin");
  });
});

describe("shippudenSealedReleases", () => {
  const rows = shippudenSealedReleases();

  /*
    La recherche officielle est littérale : `keyword=NARUTO` rendait 56
    produits, `keyword=ナルト` en rend 58. Bandai écrit certains titres en
    latin **pleine chasse** (ＮＡＲＵＴＯ), invisible à une requête ASCII — et
    c'est ainsi que l'acte 5 manquait.
  */
  it("porte l'acte 5, trouvé seulement par la recherche en katakana", () => {
    expect(rows.some((r) => r.slug === "booster-shippuden-act5-jp")).toBe(true);
    expect(rows.some((r) => r.slug === "vending-shippuden-act5-jp")).toBe(true);
  });

  it("rend la ligne 疾風伝 depuis le relevé officiel", () => {
    expect(rows.length).toBeGreaterThanOrEqual(16);
    expect(rows.every((r) => r.lang === "JA" && r.attested)).toBe(true);
    /*
      Le JAN vient de la fiche Bandai, alors seul ce qui en a une en porte un.
      L'acte 1 n'a pas de fiche : il est reconstitué depuis le site de jeu, et
      exiger un JAN de lui reviendrait à en inventer un.
    */
    const official = rows.filter((r) => r.stagingKind === "carddass-official");
    expect(official.every((r) => (r.jan ?? "").length >= 10)).toBe(true);
  });

  /*
    Bandai ne porte pas le premier acte, si bien que le catalogue avait 75
    cartes en `maku1` et aucun produit scellé pour les contenir. Les trois SKU
    viennent de la page de lancement archivée de carddas.com.
  */
  it("reconstitue le premier acte, absent de la base Bandai", () => {
    const act1 = rows.filter((r) => r.setCode === "maku1");
    expect(act1.map((r) => r.slug).sort()).toEqual([
      "booster-shippuden-act1-jp",
      "starter-shippuden-act1-jp",
      "vending-shippuden-act1-jp",
    ]);
    expect(act1.every((r) => r.stagingKind === "carddas-jp")).toBe(true);
    expect(act1.every((r) => r.jan === null)).toBe(true);
    // Le format se lit dans le titre officiel, comme pour les autres actes.
    expect(
      act1.find((r) => r.slug === "vending-shippuden-act1-jp")?.format,
    ).toBe("vending");
    expect(act1.find((r) => r.slug === "starter-shippuden-act1-jp")?.kind).toBe(
      "deck",
    );
  });

  /*
    Le distributeur a le même contenu que le sachet, mais Bandai lui donne un
    JAN distinct : c'est un produit qu'on achète et possède à part. La décision
    suit le code-barres, pas le contenu.
  */
  it("compte le distributeur comme un SKU à lui, et le garde aléatoire", () => {
    const vending = rows.filter((r) => r.format === "vending");
    expect(vending.length).toBeGreaterThan(0);
    expect(vending.every((r) => r.kind === "booster")).toBe(true);
    for (const v of vending) {
      expect(
        rows.some((r) => r.slug === v.slug.replace("vending", "booster")),
      ).toBe(true);
    }
  });

  it("ne garde qu'un SKU quand Bandai liste deux fois le même acte", () => {
    // Le troisième acte apparaît deux fois dans la base officielle.
    expect(
      rows.filter((r) => r.slug === "booster-shippuden-act3-jp"),
    ).toHaveLength(1);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
  });

  it("range les actes sous leur propre code de série", () => {
    // `maku` pour les 幕, jamais `maki` qui est celui des dix-sept volumes.
    expect(
      rows.find((r) => r.slug === "booster-shippuden-act2-jp")?.setCode,
    ).toBe("maku2");
    expect(rows.every((r) => !r.setCode || r.setCode.startsWith("maku"))).toBe(
      true,
    );
  });
});
