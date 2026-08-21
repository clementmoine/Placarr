import { describe, expect, it } from "vitest";

import enCcgSeries from "./curated/sources/en-ccg-series.json";
import { parseEnCcgPrintedRef } from "./parseEnCcgPrinted";

describe("parseEnCcgPrintedRef", () => {
  it.each([
    ["N-1646", "n", "n1646", false],
    ["J-074", "j", "j074", false],
    ["M-125", "m", "m125", false],
    ["C-035", "c", "c035", false],
    ["PR-060", "pr", "pr060", false],
    ["PR-032", "pr", "pr032", false],
    ["PR-096", "pr", "pr096", false],
  ])("%s → %s %s", (raw, cardType, number, usExclusive) => {
    expect(parseEnCcgPrintedRef(raw)).toEqual({
      cardType,
      number,
      usExclusive,
    });
  });

  it("keeps tin/US exclusives off the regular N/J/M numbers", () => {
    expect(parseEnCcgPrintedRef("N-US122")).toEqual({
      cardType: "n",
      number: "nus122",
      usExclusive: true,
    });
    expect(parseEnCcgPrintedRef("J-US001")).toMatchObject({
      cardType: "j",
      usExclusive: true,
      number: "jus001",
    });
    expect(parseEnCcgPrintedRef("M-US093")).toMatchObject({
      usExclusive: true,
      number: "mus093",
    });
  });

  it("rejects Carddass and TCDB invented prefixes", () => {
    expect(parseEnCcgPrintedRef("NI-1650")).toBeNull();
    expect(parseEnCcgPrintedRef("PTHJ-001")).toBeNull();
    expect(parseEnCcgPrintedRef("TE-109")).toBeNull();
  });
});

describe("Brasil Bandai Unlimited series titles", () => {
  it("fills the TCDB hole at Series 13 and names 19–21", () => {
    expect(enCcgSeries.seriesTitles["13"]).toBe("Fateful Reunion");
    expect(enCcgSeries.seriesTitles["19"]).toBe("Path of Pain");
    expect(enCcgSeries.seriesTitles["20"]).toBe("Tales of the Gallant Sage");
    expect(enCcgSeries.seriesTitles["21"]).toBe("Shattered Truth");
    expect(enCcgSeries.seriesTitles["21.5"]).toBe("Tournament Pack 3");
    expect(enCcgSeries.seriesTitles).not.toHaveProperty("28");
  });

  it("records printed US-exclusive codes from the ban list", () => {
    expect(enCcgSeries.usExclusivePrinted).toContain("N-US122");
    expect(enCcgSeries.usExclusivePrinted).toContain("J-US001");
    expect(
      enCcgSeries.usExclusiveNamed.find((row) => row.printed === "N-US122")
        ?.name,
    ).toBe("Naruto Uzumaki");
    expect(enCcgSeries.printedAlsoSeen).toContain("C-035");
    expect(enCcgSeries.storm3Post.claimedIneditePromo).toBe("PR-032");
  });
});
