import { describe, expect, it } from "vitest";

import type { CardsIndexV1 } from "@/effects/cardsIndex";

import {
  buildNarutoCompleteness,
  faceSourceOfFilename,
  renderCompletenessMarkdown,
} from "./buildCompleteness";

function index(cards: CardsIndexV1["cards"]): CardsIndexV1 {
  return { version: 1, pack: "naruto/carddass", cards };
}

describe("faceSourceOfFilename", () => {
  it("reads the source out of the face filename", () => {
    expect(faceSourceOfFilename("art.drive.webp")).toBe("drive");
    expect(faceSourceOfFilename("art.carddass.jpg")).toBe("carddass");
    // An unnamed leftover is not a source, it is the absence of one.
    expect(faceSourceOfFilename("art.jpg")).toBe("legacy");
  });
});

describe("buildNarutoCompleteness", () => {
  const sample = index({
    "naruto:ni-0001": {
      set: "ninja",
      card: "ni0001",
      langs: {
        fr: { name: "Naruto Uzumaki", art: "art.carddass.jpg" },
        ja: { name: "うずまきナルト", art: "art.nikita.jpg" },
        it: { name: "Naruto Uzumaki" },
      },
    },
    "naruto:ni-0002": {
      set: "ninja",
      card: "ni0002",
      langs: {
        // A face with no name — the axes are independent.
        ja: { art: "art.fril.jpg" },
      },
    },
  });

  it("counts the four axes apart, never as one score", () => {
    const report = buildNarutoCompleteness(sample, {
      cards: { ni0001: {} },
    });
    const ja = report.locales.ja!;
    expect(ja.prints).toBe(2);
    expect(ja.image.held).toBe(2);
    expect(ja.title.held).toBe(1);
    // Facts exist for ni0001 only.
    expect(ja.detail.held).toBe(1);
    expect(ja.imageWithoutTitle).toBe(1);
    expect(ja.titleWithoutImage).toBe(0);

    const it = report.locales.it!;
    expect(it.title.held).toBe(1);
    expect(it.image.held).toBe(0);
    expect(it.titleWithoutImage).toBe(1);
  });

  it("says where the faces come from", () => {
    const report = buildNarutoCompleteness(sample, null);
    expect(report.locales.ja?.faceSources).toEqual({ nikita: 1, fril: 1 });
    expect(report.locales.fr?.faceSources).toEqual({ carddass: 1 });
  });

  it("measures the numbering against what Bandai published", () => {
    const report = buildNarutoCompleteness(sample, null);
    // 忍 1-417 published, two held here.
    const ninja = report.publishedNumbering.find((row) =>
      row.family.startsWith("忍"),
    );
    expect(ninja?.max).toBe(417);
    expect(ninja?.held).toBe(2);
    expect(ninja?.missingNumbers).toContain(3);
    expect(ninja?.missingNumbers).not.toContain(1);
    expect(report.publishedTotal.max).toBe(1169);
  });

  it("reports detail as absent where no facts exist rather than as zero prints", () => {
    const report = buildNarutoCompleteness(sample, null);
    expect(report.locales.fr?.detail).toEqual({
      held: 0,
      missing: 1,
      pct: "0.0%",
    });
  });
});

describe("renderCompletenessMarkdown", () => {
  it("puts the locales in reading order and keeps the axes separate", () => {
    const md = renderCompletenessMarkdown(
      buildNarutoCompleteness(
        index({
          "naruto:ni-0001": {
            set: "ninja",
            card: "ni0001",
            langs: { it: { name: "x" }, fr: { art: "art.carddass.jpg" } },
          },
        }),
        null,
      ),
    );
    expect(md.indexOf("| **FR**")).toBeLessThan(md.indexOf("| **IT**"));
    expect(md).toContain("Détail de jeu");
    expect(md).toContain("D'où viennent les faces");
  });
});
