/**
 * Harvest carddass.fr/dbz CDX scout → curated FR face ledger.
 */
import { describe, expect, it } from "vitest";

import {
  buildCarddassFrDbzLedgerFromScout,
  buildCarddassFrPouvoirMarkers,
} from "./carddassFr";

describe("harvestCarddassFrDbz", () => {
  it("builds a FR face ledger from the Wayback CDX scout when present", () => {
    const { faces, outPath, markers, markersPath } =
      buildCarddassFrDbzLedgerFromScout();
    expect(outPath).toContain("carddass-fr-dbz-faces.json");
    expect(markersPath).toContain("carddass-fr-dbz-pouvoir-markers.json");
    // Scout may be absent in CI — empty is honest.
    expect(Array.isArray(faces)).toBe(true);
    expect(Array.isArray(markers)).toBe(true);
    if (faces.length > 0) {
      expect(faces[0]).toMatchObject({
        series: expect.any(String),
        file: expect.any(String),
        waybackUrl: expect.stringContaining("web.archive.org"),
      });
    }
  });
});

describe("buildCarddassFrPouvoirMarkers", () => {
  it("groups PA/PB filenames per series+number without inventing power labels", () => {
    const rows = buildCarddassFrPouvoirMarkers([
      {
        series: "4",
        file: "D-250 PA copie.jpg",
        timestamp: "1",
        waybackUrl: "https://web.archive.org/web/1id_/http://x/PA.jpg",
      },
      {
        series: "4",
        file: "D-250.jpg",
        timestamp: "2",
        waybackUrl: "https://web.archive.org/web/2id_/http://x/plain.jpg",
      },
      {
        series: "5",
        file: "D-434-PB.jpg",
        timestamp: "3",
        waybackUrl: "https://web.archive.org/web/3id_/http://x/PB.jpg",
      },
    ]);
    expect(rows).toEqual([
      {
        series: "4",
        setHint: "part4",
        printed: "D-250",
        number: "d0250",
        markers: ["pa"],
        files: [
          {
            marker: "pa",
            file: "D-250 PA copie.jpg",
            waybackUrl: "https://web.archive.org/web/1id_/http://x/PA.jpg",
            timestamp: "1",
          },
        ],
      },
      {
        series: "5",
        setHint: "part5",
        printed: "D-434",
        number: "d0434",
        markers: ["pb"],
        files: [
          {
            marker: "pb",
            file: "D-434-PB.jpg",
            waybackUrl: "https://web.archive.org/web/3id_/http://x/PB.jpg",
            timestamp: "3",
          },
        ],
      },
    ]);
  });
});
