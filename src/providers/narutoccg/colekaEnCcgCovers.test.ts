import { describe, expect, it } from "vitest";

import coleka from "./curated/sources/coleka.json";
import {
  colekaCarddassFrBranchCoverUrl,
  colekaEnCcgCoverLedger,
  colekaEnCcgNewDisplays,
  colekaThumbToFull,
} from "./colekaEnCcgCovers";

describe("coleka EN CCG covers", () => {
  it("turns Coleka size suffixes into the full rubrique webp", () => {
    expect(
      colekaThumbToFull(
        "https://thumbs.coleka.com/media/rubrique/202401/26/96f6jtlhy9888hjmetwn_300x300.webp",
      ),
    ).toBe(
      "https://thumbs.coleka.com/media/rubrique/202401/26/96f6jtlhy9888hjmetwn.webp",
    );
    expect(
      colekaThumbToFull(
        "https://thumbs.coleka.com/media/rubrique/201802/21/cartes-de-collection-naruto-cartes-a-jouer-et-a-collectionner-cartes-naruto-serie-01_120x120.webp",
      ),
    ).toBe(
      "https://thumbs.coleka.com/media/rubrique/201802/21/cartes-de-collection-naruto-cartes-a-jouer-et-a-collectionner-cartes-naruto-serie-01.webp",
    );
  });

  it("keeps Coleka's own Carddass FR branch name and 741 count", () => {
    expect(coleka.seriesFrancaises.title).toBe(
      "Naruto Carddass - Séries Françaises",
    );
    expect(coleka.seriesFrancaises.listedCount).toBe(741);
    expect(coleka.seriesFrancaises.scrape).toBe(false);
    expect(coleka.seriesFrancaises.rules.winGains).toBe(10);
    expect(coleka.seriesFrancaises.description).toContain("Naruto Carddass");
    expect(coleka.seriesFrancaises.description).toContain("10 gains");
    expect(coleka.seriesFrancaises.description).toContain("741 cartes");
    expect(coleka.branches["series-francaises"]).toContain("_r41705");
    expect(coleka.branches["serie-01"]).toContain("_r4108");
    expect(coleka.branches["serie-02"]).toContain("_r4109");
    expect(coleka.branches["serie-05"]).toContain("_r4112");
  });

  it("uses the full Carddass FR branch cover, not the 300×300 thumb", () => {
    const full =
      "https://thumbs.coleka.com/media/rubrique/202411/15/cartes-de-collection-cartes-anime-manga-naruto-cartes-a-jouer-et-a-collectionner-naruto-carddass-series-francaises.webp";
    expect(coleka.branches["series-francaises-cover"]).toBe(full);
    expect(colekaCarddassFrBranchCoverUrl()).toBe(full);
    expect(colekaCarddassFrBranchCoverUrl()).not.toContain("_300x300");
  });

  it("does not mint a second s28 SKU or ingest Kayou / Carddass FR", () => {
    const sets = colekaEnCcgNewDisplays().map((row) => row.set);
    expect(sets).toEqual([
      "s13",
      "s14",
      "s15",
      "s17",
      "s18",
      "s20",
      "s24",
      "s25",
      "s26",
    ]);
    expect(sets).not.toContain("s28");
    expect(sets.some((s) => Number(s.slice(1)) <= 6)).toBe(false);
    const ledger = colekaEnCcgCoverLedger();
    expect(ledger.skip.map((row) => row.kind)).toEqual([
      "kayou",
      "carddass-fr-branch",
    ]);
    expect(ledger.rampageTornado.scrape).toBe(false);
    expect(ledger.rampageTornado.setCode).toBe("s11");
    expect(ledger.rampageTornado.url).toContain("_r16963");
    const hashed = ledger.covers.find((row) => row.set === "s26");
    expect(hashed?.title).toBe("Avenger's Wrath");
    expect(hashed?.thumb).toContain("96f6jtlhy9888hjmetwn");
    const s27 = ledger.seriesPages.find((row) => row.set === "s27");
    expect(s27?.printedLanguages).toEqual(["en"]);
    expect(s27?.colekaNote).toBe("sorti uniquement en anglais");
    expect(s27?.url).toContain("_r36959");
    expect(ledger.missingSeriesInPaste).toEqual([16, 19, 21, 22, 23]);
    expect(ledger.goatGapPackshots).toEqual([
      "s16",
      "s19",
      "s21",
      "s22",
      "s23",
      "s27",
    ]);
    expect(ledger.carddassFrSeriesIcons.map((row) => row.set)).toEqual([
      "s1",
      "s2",
      "s3",
      "s4",
      "s5",
    ]);
  });
});
