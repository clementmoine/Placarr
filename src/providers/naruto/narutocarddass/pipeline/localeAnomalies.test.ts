import { describe, expect, it } from "vitest";

import {
  buildLocaleAnomalyReport,
  renderLocaleAnomaliesMarkdown,
} from "./localeAnomalies";

describe("localeAnomalies", () => {
  it("flags FR titles on EN-only series and IT outside S1–S6", () => {
    const report = buildLocaleAnomalyReport({
      version: 1,
      pack: "naruto/carddass",
      generatedAt: "2026-01-01T00:00:00.000Z",
      cards: {
        "naruto:s8-n0100": {
          set: "ninja",
          card: "n0100",
          langs: { fr: { name: "Ghost", art: "art.jpg" }, en: { name: "Ghost" } },
        },
        "naruto:s1-ni0001": {
          set: "ninja",
          card: "ni0001",
          langs: { it: { name: "Yuki-hime" }, fr: { name: "Yuki-hime" } },
        },
        "naruto:s12-n0500": {
          set: "ninja",
          card: "n0500",
          langs: { it: { name: "Too late" } },
        },
      },
    });
    expect(report.anomalies.frTitlesOnEnOnlySeries.map((r) => r.printKey)).toEqual([
      "naruto:s8-n0100",
    ]);
    expect(report.anomalies.itTitlesOutsideS1S6.map((r) => r.printKey)).toEqual([
      "naruto:s12-n0500",
    ]);
    expect(renderLocaleAnomaliesMarkdown(report)).toContain("anomalies multi-locales");
  });
});
