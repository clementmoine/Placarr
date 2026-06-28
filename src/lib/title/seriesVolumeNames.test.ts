import { describe, expect, it } from "vitest";

import {
  buildSeriesItemName,
  countSeriesVolumes,
  expandSeriesVolumeNames,
  seriesVolumePaddingWidth,
  SERIES_VOLUME_PATTERNS,
} from "@/lib/title/seriesVolumeNames";

describe("seriesVolumeNames", () => {
  it("pads volumes from the range end", () => {
    expect(seriesVolumePaddingWidth(9)).toBe(2);
    expect(seriesVolumePaddingWidth(10)).toBe(3);
    expect(seriesVolumePaddingWidth(35)).toBe(3);
    expect(seriesVolumePaddingWidth(99)).toBe(3);
    expect(seriesVolumePaddingWidth(100)).toBe(3);
    expect(seriesVolumePaddingWidth(1000)).toBe(4);
  });

  it("builds zero-padded tome names", () => {
    expect(
      buildSeriesItemName(
        SERIES_VOLUME_PATTERNS.tome_nn,
        "Naruto",
        1,
        9,
      ),
    ).toBe("Naruto Tome 01");
    expect(
      buildSeriesItemName(
        SERIES_VOLUME_PATTERNS.tome_nn,
        "Naruto",
        1,
        52,
      ),
    ).toBe("Naruto Tome 001");
    expect(
      buildSeriesItemName(
        SERIES_VOLUME_PATTERNS.tome_nn,
        "Naruto",
        52,
        52,
      ),
    ).toBe("Naruto Tome 052");
  });

  it("uses three digits from volume 10 upward", () => {
    const names = expandSeriesVolumeNames(
      "Série",
      1,
      35,
      SERIES_VOLUME_PATTERNS.numero_nn,
    );
    expect(names[0]).toBe("Série n°001");
    expect(names[34]).toBe("Série n°035");
  });

  it("pads volume 99 with three digits when the range reaches 100", () => {
    expect(
      buildSeriesItemName(
        SERIES_VOLUME_PATTERNS.numero_nn,
        "Série",
        99,
        100,
      ),
    ).toBe("Série n°099");
    expect(
      buildSeriesItemName(
        SERIES_VOLUME_PATTERNS.numero_nn,
        "Série",
        100,
        100,
      ),
    ).toBe("Série n°100");
  });

  it("expands an inclusive volume range", () => {
    expect(
      expandSeriesVolumeNames(
        "One Piece",
        1,
        3,
        SERIES_VOLUME_PATTERNS.numero_nn,
      ),
    ).toEqual(["One Piece n°01", "One Piece n°02", "One Piece n°03"]);
  });

  it("expands large inclusive ranges", () => {
    const names = expandSeriesVolumeNames(
      "Naruto",
      1,
      1000,
      SERIES_VOLUME_PATTERNS.tome_nn,
    );
    expect(names).toHaveLength(1000);
    expect(names[0]).toBe("Naruto Tome 0001");
    expect(names[999]).toBe("Naruto Tome 1000");
  });

  it("counts volumes with numeric strings, not lexicographic order", () => {
    expect(countSeriesVolumes("2", "15")).toBe(14);
    expect(countSeriesVolumes(1, 52)).toBe(52);
    expect(countSeriesVolumes("1", "52")).toBe(52);
    expect(countSeriesVolumes("", 52)).toBe(0);
  });
});
