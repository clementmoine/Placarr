import { describe, expect, it } from "vitest";

import type { NarutoPrintRow, NarutoTitleRow } from "./indexStore";
import {
  isColekaPlaceholderName,
  mergeBrasilUsExclusivesIntoIndex,
  mergeChecklistFrNamesIntoIndex,
  mergeColekaFrNamesIntoIndex,
  mergeCardgameclubItRarities,
  mergeFoundCatalogueLedgers,
  mergeHinokunianJaNamesIntoIndex,
  mergeTitleCorrections,
  mergeSlabZJaNamesIntoIndex,
  mergeUserPhysicalCcgIntoIndex,
} from "./mergeAttestedLedgers";

const ni001: NarutoPrintRow = {
  printKey: "naruto:ni-0001",
  setCode: "s1",
  number: "ni0001",
  cardType: "ni",
  family: "ninja",
};

const n1650: NarutoPrintRow = {
  printKey: "naruto:n-1650",
  setCode: "s28",
  number: "n1650",
  cardType: "n",
  family: "ninja",
};

describe("isColekaPlaceholderName", () => {
  it("drops Coleka slugs and keeps real names", () => {
    expect(isColekaPlaceholderName("Carte CL-32")).toBe(true);
    expect(isColekaPlaceholderName("Carte NI-255")).toBe(true);
    expect(isColekaPlaceholderName("Uruchai Uchiha")).toBe(false);
    expect(isColekaPlaceholderName("Shikamaru Nara")).toBe(false);
  });
});

describe("mergeColekaFrNamesIntoIndex", () => {
  it("fills missing FR names and skips placeholders", () => {
    const unnamed: NarutoPrintRow = {
      printKey: "naruto:cl-0033",
      setCode: "s6",
      number: "cl0033",
      cardType: "cl",
      family: "client",
    };
    const placeholder: NarutoPrintRow = {
      printKey: "naruto:cl-0032",
      setCode: "s6",
      number: "cl0032",
      cardType: "cl",
      family: "client",
    };
    const official: NarutoTitleRow = {
      printKey: "naruto:ni-0001",
      lang: "fr",
      fullName: "Naruto Uzumaki",
    };
    const merged = mergeColekaFrNamesIntoIndex({
      prints: [ni001, unnamed, placeholder],
      titles: [official],
    });
    expect(
      merged.titles.find((t) => t.printKey === "naruto:cl-0033")?.fullName,
    ).toBe("Uruchai Uchiha");
    expect(
      merged.titles.find((t) => t.printKey === "naruto:cl-0032"),
    ).toBeUndefined();
    expect(
      merged.titles.find((t) => t.printKey === "naruto:ni-0001")?.fullName,
    ).toBe("Naruto Uzumaki");
    expect(merged.prints).toHaveLength(3);
  });
});

describe("mergeChecklistFrNamesIntoIndex", () => {
  it("fills an unnamed FR print from the printed checklist", () => {
    const merged = mergeChecklistFrNamesIntoIndex({
      prints: [ni001],
      titles: [],
    });
    expect(
      merged.titles.find((t) => t.printKey === "naruto:ni-0001"),
    ).toMatchObject({ lang: "fr", fullName: "Naruto Uzumaki" });
  });
});

describe("mergeSlabZJaNamesIntoIndex", () => {
  it("adds attested JA rookies onto existing Carddass prints", () => {
    const merged = mergeSlabZJaNamesIntoIndex({
      prints: [ni001],
      titles: [
        { printKey: "naruto:ni-0001", lang: "fr", fullName: "Naruto Uzumaki" },
      ],
    });
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:ni-0001" && t.lang === "ja",
      )?.fullName,
    ).toBe("うずまきナルト");
    expect(merged.prints).toEqual([ni001]);
  });
});

describe("mergeUserPhysicalCcgIntoIndex", () => {
  it("mints PR-096 and does not invent a second Kisame key", () => {
    const merged = mergeUserPhysicalCcgIntoIndex({
      prints: [n1650],
      titles: [
        {
          printKey: "naruto:n-1650",
          lang: "fr",
          fullName: "Kisame Hoshigaki",
        },
      ],
    });
    expect(merged.addedPrints).toEqual(["naruto:pr-0096"]);
    expect(
      merged.prints.find((p) => p.printKey === "naruto:pr-0096"),
    ).toMatchObject({
      setCode: "promo",
      number: "pr0096",
      family: "promo",
    });
    expect(
      merged.titles.find((t) => t.printKey === "naruto:pr-0096"),
    ).toMatchObject({ lang: "fr", fullName: "4E Hokage" });
    expect(
      merged.prints.filter((p) => p.printKey === "naruto:n-1650"),
    ).toHaveLength(1);
  });
});

describe("mergeBrasilUsExclusivesIntoIndex", () => {
  it("mints N-US122 beside n122", () => {
    const merged = mergeBrasilUsExclusivesIntoIndex({
      prints: [
        {
          printKey: "naruto:n-0122",
          setCode: "s3",
          number: "n0122",
          cardType: "n",
          family: "ninja",
        },
      ],
      titles: [
        { printKey: "naruto:n-0122", lang: "en", fullName: "Regular ninja" },
      ],
    });
    expect(merged.addedPrints).toContain("naruto:nus-0122");
    expect(
      merged.titles.find((t) => t.printKey === "naruto:nus-0122")?.fullName,
    ).toBe("Naruto Uzumaki");
    expect(
      merged.titles.find((t) => t.printKey === "naruto:n-0122")?.fullName,
    ).toBe("Regular ninja");
  });
});

describe("mergeFoundCatalogueLedgers", () => {
  it("keeps NI and N as two impressions", () => {
    const merged = mergeFoundCatalogueLedgers({
      prints: [ni001],
      titles: [
        { printKey: "naruto:ni-0001", lang: "fr", fullName: "Naruto Uzumaki" },
      ],
    });
    expect(merged.prints.some((p) => p.printKey === "naruto:n-0001")).toBe(
      true,
    );
    expect(merged.prints.some((p) => p.printKey === "naruto:ni-0001")).toBe(
      true,
    );
    expect(
      merged.titles.find((t) => t.printKey === "naruto:n-0001")?.lang,
    ).toBe("en");
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:ni-0001" && t.lang === "ja",
      )?.fullName,
    ).toBe("うずまきナルト");
    expect(merged.physicalAdded).toContain("naruto:pr-0096");
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:pr-0096" && t.lang === "fr",
      )?.fullName,
    ).toBe("4E Hokage");
    expect(merged.prints.some((p) => p.printKey === "naruto:n-1715")).toBe(
      false,
    );
  });
});

describe("mergeHinokunianJaNamesIntoIndex", () => {
  const prints = [
    {
      printKey: "naruto:ni-0025",
      setCode: "s1",
      number: "ni0025",
      cardType: "ni",
    },
    {
      printKey: "naruto:te-0001",
      setCode: "s1",
      number: "te0001",
      cardType: "te",
    },
  ] as never[];

  it("nomme les fiches japonaises qui n'ont pas de titre", () => {
    const merged = mergeHinokunianJaNamesIntoIndex({
      prints,
      titles: [],
      names: [
        { diskHint: "ni0025", name: "風花小雪" },
        { diskHint: "te0001", name: "影分身の術" },
      ],
    });
    expect(merged.titled).toHaveLength(2);
    expect(
      merged.titles.find(
        (t) => t.printKey === "naruto:ni-0025" && t.lang === "ja",
      )?.fullName,
    ).toBe("風花小雪");
  });

  /*
    Le relevé est riche mais c'est un site de fan. Le catalogue tient déjà des
    noms venus de sources officielles : ceux-là gardent la main.
  */
  it("n'écrase jamais un titre déjà en place", () => {
    const merged = mergeHinokunianJaNamesIntoIndex({
      prints,
      titles: [
        { printKey: "naruto:ni-0025", lang: "ja", fullName: "うずまきナルト" },
      ] as never[],
      names: [{ diskHint: "ni0025", name: "風花小雪" }],
    });
    expect(merged.titled).toEqual([]);
    expect(
      merged.titles.filter((t) => t.printKey === "naruto:ni-0025"),
    ).toHaveLength(1);
  });

  it("ignore une référence qu'aucun tirage ne porte", () => {
    const merged = mergeHinokunianJaNamesIntoIndex({
      prints,
      titles: [],
      // Les cartes de borne n'ont pas encore de tirage : elles ne nomment rien.
      names: [{ diskHint: "dt0002-t", name: "うずまきナルト" }],
    });
    expect(merged.titled).toEqual([]);
    expect(merged.titles).toEqual([]);
  });

  it("ne bronche pas sans moisson sur le disque", () => {
    const merged = mergeHinokunianJaNamesIntoIndex({
      prints,
      titles: [],
      names: [],
    });
    expect(merged.prints).toHaveLength(2);
    expect(merged.titled).toEqual([]);
  });
});

describe("mergeTitleCorrections", () => {
  const prints = [
    {
      printKey: "naruto:n-0849",
      setCode: "s17",
      number: "n0849",
      cardType: "n",
    },
  ] as never[];

  it("réécrit le titre que le relevé a mal lu", () => {
    const merged = mergeTitleCorrections({
      prints,
      titles: [
        { printKey: "naruto:n-0849", lang: "en", fullName: "Ghost Samurai" },
      ] as never[],
    });
    expect(merged.corrected).toEqual(["naruto:n-0849"]);
    expect(merged.titles[0]?.fullName).toBe("Cursed Warrior");
  });

  /*
    Seule étape qui écrase : le garde évite qu'elle réécrive autre chose que ce
    qu'on a vérifié. Si la boutique se corrige, la ligne devient inerte.
  */
  it("ne touche pas un titre qui n'est plus celui déclaré faux", () => {
    const merged = mergeTitleCorrections({
      prints,
      titles: [
        { printKey: "naruto:n-0849", lang: "en", fullName: "Cursed Warrior" },
      ] as never[],
    });
    expect(merged.corrected).toEqual([]);
    expect(merged.titles[0]?.fullName).toBe("Cursed Warrior");
  });

  it("ne touche pas une autre langue que celle visée", () => {
    const merged = mergeTitleCorrections({
      prints,
      titles: [
        { printKey: "naruto:n-0849", lang: "fr", fullName: "Ghost Samurai" },
      ] as never[],
    });
    expect(merged.corrected).toEqual([]);
  });

  it("se signale quand le tirage visé n'existe pas", () => {
    const merged = mergeTitleCorrections({ prints: [], titles: [] });
    expect(merged.corrected).toEqual([]);
    expect(merged.skipped.join(" ")).toContain("n0849");
  });
});

describe("mergeCardgameclubItRarities", () => {
  const prints = [
    {
      printKey: "naruto:cl-0005",
      setCode: "s2",
      number: "cl0005",
      cardType: "cl",
    },
  ] as never[];

  it("pose la rareté italienne sur une fiche qui n'en a pas", () => {
    const merged = mergeCardgameclubItRarities({
      prints,
      titles: [
        { printKey: "naruto:cl-0005", lang: "it", fullName: "Zori" },
      ] as never[],
    });
    expect(merged.rarities).toEqual(["naruto:cl-0005"]);
    expect(merged.titles[0]?.rarity).toBe("comune");
  });

  /*
    L'archive n'apporte que la rareté : les noms sont déjà là, et une rareté
    déjà posée vient d'une source qu'on ne remplace pas par une boutique morte.
  */
  it("ne touche ni au nom ni à une rareté déjà posée", () => {
    const merged = mergeCardgameclubItRarities({
      prints,
      titles: [
        {
          printKey: "naruto:cl-0005",
          lang: "it",
          fullName: "Zori",
          rarity: "rara",
        },
      ] as never[],
    });
    expect(merged.rarities).toEqual([]);
    expect(merged.titles[0]).toMatchObject({
      fullName: "Zori",
      rarity: "rara",
    });
  });

  it("ne déborde pas sur les autres langues", () => {
    const merged = mergeCardgameclubItRarities({
      prints,
      titles: [
        { printKey: "naruto:cl-0005", lang: "fr", fullName: "Zori" },
      ] as never[],
    });
    expect(merged.rarities).toEqual([]);
    expect(merged.titles[0]?.rarity).toBeUndefined();
  });
});
