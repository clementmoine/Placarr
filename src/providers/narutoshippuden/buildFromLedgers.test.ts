/**
 * Les registres officiels du 疾風伝, et ce qu'ils montent.
 *
 * Ces assertions vivaient dans le pack Carddass jusqu'au 2026-08-21, avec les
 * registres qu'elles gardent. Elles y disaient surtout ce que ces listes **ne
 * sont pas** — pas du 巻, pas du Data Carddass — parce qu'elles y côtoyaient un
 * autre jeu. Ici la confusion n'est plus possible, mais les gardes restent :
 * c'est leur numérotation repartant de 1 qui rendait la confusion facile.
 */
import { describe, expect, it } from "vitest";

import {
  buildShippudenFromLedgers,
  readShippudenChecklist,
  readShippudenLedgers,
  releaseForNumber,
  shippudenPrintKey,
} from "./buildFromLedgers";

describe("registres du 疾風伝", () => {
  const [maku, gaku] = readShippudenLedgers();

  it("ships 第一幕…四幕 titles on shi/mju/msa, and nothing else", () => {
    expect(maku.cards.length).toBe(269);
    expect(maku.cards.find((row) => row.number === "shi0001")).toMatchObject({
      name: "うずまきナルト",
      setCode: "maku1",
    });
    // Ni Data Carddass (`nm`), ni la ligne 術 du Carddass (`j0`), ni 忍伝-学.
    expect(maku.cards.some((row) => row.number.startsWith("nm"))).toBe(false);
    expect(maku.cards.some((row) => row.number.startsWith("j0"))).toBe(false);
    expect(maku.cards.some((row) => row.setCode === "gaku")).toBe(false);
  });

  it("keeps 忍伝-学 off 幕 shi numbers", () => {
    expect(gaku.cards.length).toBe(40);
    expect(gaku.cards[0]).toMatchObject({
      printed: "忍伝-学001",
      number: "gaku0001",
      name: "うずまきナルト",
    });
    expect(shippudenPrintKey("gaku0001")).toBe("naruto:gaku-0001");
    expect(shippudenPrintKey("shi0107")).not.toBe("naruto:gaku-0001");
  });

  /*
    Le pack Carddass partage le slug `naruto` : seule la **famille** sépare les
    deux jeux, et `ni0001` comme `shi0001` sont tous deux うずまきナルト.
  */
  it("mints only its own four families", () => {
    expect(shippudenPrintKey("shi0001")).toBe("naruto:shi-0001");
    expect(shippudenPrintKey("mju0062")).toBe("naruto:mju-0062");
    expect(shippudenPrintKey("msa0026")).toBe("naruto:msa-0026");
    expect(shippudenPrintKey("ni0001")).toBeNull();
    expect(shippudenPrintKey("te0014")).toBeNull();
  });

  it("mints every ledger row — a skip means a number we cannot read", () => {
    const report = buildShippudenFromLedgers({ dryRun: true });
    expect(report.skipped).toEqual([]);
    expect(report.rows).toBe(309);
    expect(report.titles).toBe(309);
    /*
      `prints` dépasse les 309 titres depuis que la liste officielle atteste des
      numéros que nul registre ne nomme — voir le bloc suivant. Ce test-ci ne
      garde que la lecture des registres : chaque ligne se lit, aucune n'est
      sautée.
    */
    expect(report.prints).toBeGreaterThanOrEqual(309);
  });
});

/*
  La liste officielle des sorties, relevée le 2026-08-21 sur la page sœur de
  celle du Carddass. Le catalogue s'arrêtait au quatrième acte parce que les
  listes de cartes moissonnées s'y arrêtaient ; celle-ci va jusqu'au sixième et
  atteste en plus le Coin＋.
*/
describe("liste officielle des sorties", () => {
  const checklist = readShippudenChecklist();

  it("covers the eight acts, and says plainly which numbering is missing", () => {
    expect(checklist.releases.map((r) => r.setCode)).toEqual([
      "maku1",
      "maku2",
      "coin",
      "maku3",
      "gaku",
      "maku4",
      "maku5",
      "maku6",
      "maku7",
      "maku8",
    ]);
    /*
      Les deux derniers actes existent — leurs boosters sont au catalogue
      scellé — mais la source note leurs plages 未確認. On garde la ligne pour
      que le trou soit visible, sans inventer un numéro.
    */
    for (const code of ["maku7", "maku8"]) {
      const release = checklist.releases.find((r) => r.setCode === code)!;
      expect(release.numberingUnknown).toBe(true);
      expect(release.shi).toBeUndefined();
    }
  });

  it("files a number into the release that printed it", () => {
    expect(releaseForNumber("shi", 1)?.setCode).toBe("maku1");
    expect(releaseForNumber("shi", 152)?.setCode).toBe("maku5");
    expect(releaseForNumber("mju", 130)?.setCode).toBe("maku6");
    expect(releaseForNumber("gaku", 40)?.setCode).toBe("gaku");
  });

  /*
    Le Coin＋ s'intercale entre le deuxième et le troisième acte, et emporte
    huit numéros 忍伝 qui ne sont donc dans aucun acte. Les rattacher au
    troisième aurait été plus simple et faux.
  */
  it("keeps the Coin＋ numbers out of the acts around it", () => {
    expect(releaseForNumber("shi", 66)?.setCode).toBe("maku2");
    expect(releaseForNumber("shi", 67)?.setCode).toBe("coin");
    expect(releaseForNumber("shi", 74)?.setCode).toBe("coin");
    expect(releaseForNumber("shi", 75)?.setCode).toBe("maku3");
  });

  it("claims nothing beyond what the ranges attest", () => {
    // 忍伝-194 serait du septième acte, dont la source n'a pas les numéros.
    expect(releaseForNumber("shi", 194)).toBeNull();
    expect(releaseForNumber("ni", 1)).toBeNull();
  });

  it("mints the attested numbers no ledger names yet", () => {
    const report = buildShippudenFromLedgers({ dryRun: true });
    // 309 titres relevés, 436 numéros attestés.
    expect(report.titles).toBe(309);
    expect(report.prints).toBe(436);
    expect(report.attested).toBe(436 - 309);
  });
});
