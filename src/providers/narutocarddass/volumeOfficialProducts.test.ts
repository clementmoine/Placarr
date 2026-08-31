import { describe, expect, it } from "vitest";

import {
  starterBook,
  volumeNumber,
  volumeOfficialProducts,
  volumeProductFormat,
} from "./volumeOfficialProducts";

describe("volumeNumber", () => {
  it("lit le volume en kanji, unités et dizaines", () => {
    expect(
      volumeNumber("NARUTO CARD GAME　巻ノ四 「～死の森の試験！～ 編」"),
    ).toBe(4);
    expect(volumeNumber("巻ノ十二 ブースターパック")).toBe(12);
    expect(volumeNumber("巻ノ十七 自販機ブースター")).toBe(17);
  });

  it("ignore un titre sans volume", () => {
    expect(volumeNumber("疾風伝 カードゲーム 第五幕")).toBeNull();
  });
});

describe("volumeProductFormat", () => {
  /*
    `自販機ブースター` contient le mot `ブースター` : le distributeur doit être
    reconnu avant, sinon il passe pour un sachet ordinaire.
  */
  it("distingue distributeur et starter, et ignore le sachet", () => {
    expect(volumeProductFormat("巻ノ十七 自販機ブースター")).toBe("vending");
    expect(volumeProductFormat("巻ノ十六 構築済みスターターセット")).toBe(
      "starter",
    );
    expect(volumeProductFormat("巻ノ十七 ブースターパック")).toBeNull();
  });
});

describe("starterBook", () => {
  it("reconnaît les trois livres que Bandai publie", () => {
    expect(starterBook("巻ノ十六 構築済みスターターセット「豪雷の書」")).toBe(
      "豪雷の書",
    );
    expect(starterBook("巻ノ十二 構築済みスターターBOX「呪印の書」")).toBe(
      "呪印の書",
    );
    expect(starterBook("巻ノ十二 構築済みスターターBOX「木ノ葉の書」")).toBe(
      "木ノ葉の書",
    );
  });
});

describe("volumeOfficialProducts", () => {
  const rows = volumeOfficialProducts();

  /*
    La ligne des dix-sept volumes n'était cataloguée que par ses boosters, alors
    que le 疾風伝 l'était par tous ses formats — une incohérence de ma part.
    Chaque format a son JAN, donc son SKU.
  */
  it("rend les distributeurs et les starters, jamais les boosters", () => {
    expect(rows.filter((r) => r.format === "vending")).toHaveLength(3);
    expect(rows.filter((r) => r.format === "starter")).toHaveLength(3);
    expect(rows.some((r) => r.slug.startsWith("booster-"))).toBe(false);
  });

  it("distingue les deux starters d'un même volume par leur livre", () => {
    // Le douzième en a deux : 木ノ葉の書 et 呪印の書.
    const vol12 = rows.filter(
      (r) => r.setCode === "maki12" && r.format === "starter",
    );
    expect(vol12.map((r) => r.slug).sort()).toEqual([
      "starter-jyuin-vol12-jp",
      "starter-konoha-vol12-jp",
    ]);
  });

  it("range les volumes sous maki, jamais maku", () => {
    // `maku` est le code des 幕 du 疾風伝 : les confondre mêlerait deux lignes.
    expect(rows.every((r) => r.setCode.startsWith("maki"))).toBe(true);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
  });
});
