import { describe, expect, it } from "vitest";

import "@/effects";
import { listEffectPacks } from "@/core/render/foil/registry";

describe("effect pack card-back contract", () => {
  it("requires every registered pack to declare a non-empty cardBackUrl under /assets/<id>/cards/", () => {
    const packs = listEffectPacks();
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(pack.cardBackUrl.trim().length).toBeGreaterThan(0);
      expect(pack.cardBackUrl.startsWith(`${pack.assetBase}/`)).toBe(true);
      expect(pack.cardBackUrl).toMatch(
        /\/cards\/back(?:\.[a-z]{2})?\.[a-z0-9]+$/i,
      );
    }
  });

  /*
    La règle visait le **CCG anglais** : il partage le verso du Carddass, donc
    lui donner un pack à part n'aurait dupliqué qu'un dos identique. Elle ne
    visait pas le 疾風伝, qui est un autre jeu — maquette, année et **dos**
    différents — et qui recevait le verso Carddass tant qu'il n'avait pas le
    sien.
  */
  it("ne double pas le Carddass pour sa ligne anglaise", () => {
    const naruto = listEffectPacks()
      .filter((pack) => pack.id.startsWith("naruto"))
      .map((pack) => pack.id)
      .sort();
    expect(naruto).toEqual([
      "naruto-carddass",
      "naruto-ninja-ranks",
      "naruto-shippuden",
      "naruto-ultra-challenge",
    ]);
    /*
      Aucun pack pour le CCG anglais : son verso est celui du Carddass. Les
      autres lignes Naruto ont chacune le leur, y compris tant que le fichier
      n'est pas encore curé — l'URL est le contrat.
    */
    expect(naruto).not.toContain("naruto-en-ccg");
  });

  /*
    Les deux jeux Naruto ne partagent pas leur dos : « NARUTO 疾風伝 CARD GAME »
    dans un losange d'un côté, le triskèle 忍/術/幻 de l'autre. C'est la raison
    d'être du second pack.
  */
  it("donne au 疾風伝 un verso qui n'est pas celui du Carddass", () => {
    const packs = new Map(
      listEffectPacks().map((pack) => [pack.id, pack.cardBackUrl]),
    );
    expect(packs.get("naruto-shippuden")).toBeTruthy();
    expect(packs.get("naruto-shippuden")).not.toBe(
      packs.get("naruto-carddass"),
    );
    expect(packs.get("naruto-ninja-ranks")).toBeTruthy();
    expect(packs.get("naruto-ninja-ranks")).not.toBe(
      packs.get("naruto-carddass"),
    );
    expect(packs.get("naruto-ultra-challenge")).toBeTruthy();
    expect(packs.get("naruto-ultra-challenge")).not.toBe(
      packs.get("naruto-carddass"),
    );
    expect(packs.get("naruto-ultra-challenge")).not.toBe(
      packs.get("naruto-ninja-ranks"),
    );
  });
});
