import { describe, expect, it } from "vitest";

import {
  seriesBaseKey,
  seriesDisplayTitles,
  seriesMaxVolumeByKey,
  seriesSiblings,
  seriesVolumeDisplayWidth,
} from "@/lib/title/series";

describe("seriesBaseKey", () => {
  it("groups members of the same series once markers are stripped", () => {
    const key = seriesBaseKey("Super Picsou Géant n°36");
    expect(seriesBaseKey("Super Picsou Géant n°102")).toBe(key);
    expect(seriesBaseKey("Super Picsou Géant #7")).toBe(key);
  });
});

describe("seriesVolumeDisplayWidth", () => {
  it("aligns to the digit count of the widest volume (no floor)", () => {
    expect(seriesVolumeDisplayWidth(9)).toBe(1);
    expect(seriesVolumeDisplayWidth(10)).toBe(2);
    expect(seriesVolumeDisplayWidth(100)).toBe(3);
  });
});

describe("seriesMaxVolumeByKey (consensus gate)", () => {
  it("requires at least two distinct volumes to register a series", () => {
    const lone = seriesMaxVolumeByKey([{ id: "a", title: "Mighty No. 9" }]);
    expect(lone.size).toBe(0);

    const duplicateVolume = seriesMaxVolumeByKey([
      { id: "a", title: "Naruto Tome 1" },
      { id: "b", title: "Naruto Tome 1" },
    ]);
    expect(duplicateVolume.size).toBe(0);

    const real = seriesMaxVolumeByKey([
      { id: "a", title: "Naruto Tome 1" },
      { id: "b", title: "Naruto Tome 12" },
    ]);
    expect(real.get(seriesBaseKey("Naruto Tome 1"))).toBe(12);
  });
});

describe("seriesDisplayTitles", () => {
  it("leaves a lone numbered title untouched (Mighty No. 9 stays itself)", () => {
    const display = seriesDisplayTitles([
      { id: "mighty", title: "Mighty No. 9" },
      { id: "catan", title: "Catan" },
    ]);
    expect(display.get("mighty")).toBe("Mighty No. 9");
    expect(display.get("catan")).toBe("Catan");
  });

  it("pads every member of a real series to the widest volume", () => {
    const entries = [
      { id: "v1", title: "Super Picsou Géant n°7" },
      { id: "v2", title: "Super Picsou Géant n°36" },
      { id: "v3", title: "Super Picsou Géant n°102" },
    ];
    const display = seriesDisplayTitles(entries);
    expect(display.get("v1")).toBe("Super Picsou Géant n°007");
    expect(display.get("v2")).toBe("Super Picsou Géant n°036");
    expect(display.get("v3")).toBe("Super Picsou Géant n°102");
  });

  it("pads an odd-marker member but keeps its own marker (editorial preserved)", () => {
    const entries = [
      { id: "a", title: "Spirou n°1" },
      { id: "b", title: "Spirou n°50" },
      { id: "c", title: "Spirou #12" },
    ];
    const display = seriesDisplayTitles(entries);
    expect(display.get("a")).toBe("Spirou n°01");
    expect(display.get("b")).toBe("Spirou n°50");
    // The odd one keeps "#", only the number is aligned — never rewritten to n°.
    expect(display.get("c")).toBe("Spirou #12");
  });

  it("keeps bare numbers when the widest volume is a single digit", () => {
    const entries = [
      { id: "a", title: "Akira Tome 1" },
      { id: "b", title: "Akira Tome 6" },
    ];
    const display = seriesDisplayTitles(entries);
    expect(display.get("a")).toBe("Akira Tome 1");
    expect(display.get("b")).toBe("Akira Tome 6");
  });
});

describe("seriesSiblings", () => {
  it("returns nothing for a lone numbered title", () => {
    expect(
      seriesSiblings("Mighty No. 9", [{ id: "a", title: "Mighty No. 9" }]),
    ).toEqual([]);
  });

  it("returns the series members sorted by ascending volume", () => {
    const entries = [
      { id: "v12", title: "Naruto Tome 12" },
      { id: "v1", title: "Naruto Tome 1" },
      { id: "v3", title: "Naruto Tome 3" },
      { id: "other", title: "Bleach Tome 2" },
    ];
    const siblings = seriesSiblings("Naruto Tome 3", entries);
    expect(siblings.map((entry) => entry.id)).toEqual(["v1", "v3", "v12"]);
  });
});

describe("franchise vs series (Final Fantasy stress test)", () => {
  const entries = [
    { id: "ff1", title: "Final Fantasy 1" },
    { id: "ff2", title: "Final Fantasy 2" },
    { id: "ff7", title: "Final Fantasy VII" },
    { id: "rem1", title: "Final Fantasy VII Remake Part 1" },
    { id: "rem2", title: "Final Fantasy VII Remake Part 2" },
  ];

  it("never collapses bare-numbered / roman franchise entries into a series", () => {
    const display = seriesDisplayTitles(entries);
    expect(display.get("ff1")).toBe("Final Fantasy 1");
    expect(display.get("ff2")).toBe("Final Fantasy 2");
    expect(display.get("ff7")).toBe("Final Fantasy VII");

    expect(seriesSiblings("Final Fantasy 1", entries)).toEqual([]);
    expect(seriesSiblings("Final Fantasy VII", entries)).toEqual([]);
  });

  it("detects only the explicitly multi-part release as a series", () => {
    const keys = seriesMaxVolumeByKey(entries);
    expect(keys.size).toBe(1);
    expect(keys.get(seriesBaseKey("Final Fantasy VII Remake Part 1"))).toBe(2);

    const display = seriesDisplayTitles(entries);
    // Width is 1 (max part is 2) → grouped, but no padding noise.
    expect(display.get("rem1")).toBe("Final Fantasy VII Remake Part 1");
    expect(display.get("rem2")).toBe("Final Fantasy VII Remake Part 2");

    expect(
      seriesSiblings("Final Fantasy VII Remake Part 1", entries).map(
        (entry) => entry.id,
      ),
    ).toEqual(["rem1", "rem2"]);
  });
});
