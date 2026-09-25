import { describe, expect, it } from "vitest";

import {
  extractTitleIntentYear,
  extractTitleSeasonYears,
  preferReleaseDateMatchingTitleYear,
  stripTitleIntentYear,
  titleIntentYearAlignment,
  titleIntentYearScoreDelta,
  titleSeasonYearsConflict,
  yearFromReleaseDate,
} from "./intentYear";

describe("title intent year", () => {
  it("extracts the last parenthetical year", () => {
    expect(extractTitleIntentYear("Resident Evil 4 (2023)")).toBe(2023);
    expect(extractTitleIntentYear("Resident Evil 4 (2005)")).toBe(2005);
    expect(extractTitleIntentYear("Foo (1999) Bar (2012)")).toBe(2012);
    expect(extractTitleIntentYear("Resident Evil 4")).toBeNull();
    expect(extractTitleIntentYear("Game (PS4)")).toBeNull();
  });

  it("strips parenthetical years for provider search", () => {
    expect(stripTitleIntentYear("Resident Evil 4 (2023)")).toBe(
      "Resident Evil 4",
    );
    expect(stripTitleIntentYear("Resident Evil 4 (2005) PS4")).toBe(
      "Resident Evil 4 PS4",
    );
    expect(stripTitleIntentYear("Resident Evil 4")).toBe("Resident Evil 4");
  });

  it("reads a year from releaseDate", () => {
    expect(yearFromReleaseDate("2023-03-24")).toBe(2023);
    expect(yearFromReleaseDate("2005")).toBe(2005);
    expect(yearFromReleaseDate(null)).toBeNull();
  });

  it("extracts bare season years from annual sports titles", () => {
    expect(extractTitleSeasonYears("LNF Stars 2001")).toEqual([2001]);
    expect(extractTitleSeasonYears("Bundesliga Stars 2000")).toEqual([2000]);
    expect(extractTitleSeasonYears("King of Fighters 2000/2001")).toEqual([
      2000, 2001,
    ]);
    expect(extractTitleSeasonYears("Resident Evil 4")).toEqual([]);
    expect(extractTitleSeasonYears("Resident Evil 4 (2023)")).toEqual([2023]);
  });

  it("conflicts when season years disagree exactly", () => {
    expect(
      titleSeasonYearsConflict(
        ["Bundesliga Stars 2001"],
        "Bundesliga Stars 2000",
      ),
    ).toBe(true);
    expect(
      titleSeasonYearsConflict(
        ["LNF Stars 2001"],
        "FA Premier League Stars 2001",
      ),
    ).toBe(false);
    expect(
      titleSeasonYearsConflict(["LNF Stars 2001"], "Bundesliga Stars 2000"),
    ).toBe(true);
    expect(titleSeasonYearsConflict(["LNF Stars"], "FIFA 2001")).toBe(false);
  });

  it("aligns release dates within ±1 year", () => {
    expect(titleIntentYearAlignment(2023, "2023-03-24")).toBe("match");
    expect(titleIntentYearAlignment(2023, "2022-12-01")).toBe("match");
    expect(titleIntentYearAlignment(2023, "2005-01-11")).toBe("mismatch");
    expect(titleIntentYearAlignment(2023, null)).toBe("unknown");
    expect(titleIntentYearAlignment(null, "2023-03-24")).toBe("unknown");
  });

  it("scores and prefers the matching remake year", () => {
    expect(titleIntentYearScoreDelta(2023, "2023-03-24")).toBeGreaterThan(0);
    expect(titleIntentYearScoreDelta(2023, "2005-01-11")).toBeLessThan(0);
    expect(
      preferReleaseDateMatchingTitleYear(2023, "2005-01-11", "2023-03-24"),
    ).toBe(1);
    expect(
      preferReleaseDateMatchingTitleYear(2023, "2023-03-24", "2005-01-11"),
    ).toBe(-1);
    expect(
      preferReleaseDateMatchingTitleYear(2023, "2023-03-24", "2023-06-01"),
    ).toBe(0);
  });
});
