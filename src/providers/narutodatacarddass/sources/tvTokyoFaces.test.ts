import { describe, expect, it } from "vitest";

import { parseDataCarddassPrinted } from "../printKey";
import { dataCarddassTvTokyoIngestFaces } from "./tvTokyoFaces";

describe("dataCarddassTvTokyoIngestFaces", () => {
  it("loads 100 official faces from TV Tokyo", () => {
    const faces = dataCarddassTvTokyoIngestFaces();
    expect(faces.length).toBe(100);

    // 18 promos DNP
    const dnp = faces.filter((f) => f.printed.startsWith("DNP-"));
    expect(dnp.length).toBe(18);

    // 82 battle cards DN
    const dn = faces.filter((f) => f.printed.startsWith("DN-"));
    expect(dn.length).toBe(82);

    // All printed refs parse cleanly into Data Carddass sets
    for (const row of faces) {
      const parsed = parseDataCarddassPrinted(row.printed);
      expect(parsed).not.toBeNull();
      expect(["dn", "dnp"]).toContain(parsed!.set);
      expect(row.url).toMatch(/^https:\/\/www\.tv-tokyo\.co\.jp\//);
    }
  });

  it("covers all 10 missing battle cards (DN-048T, DN-056T, ...)", () => {
    const faces = dataCarddassTvTokyoIngestFaces();
    const missing = [
      "DN-048T",
      "DN-056T",
      "DN-061T",
      "DN-067T",
      "DN-068T",
      "DN-072T",
      "DN-075T",
      "DN-076T",
      "DN-078T",
      "DN-081T",
    ];
    for (const code of missing) {
      const found = faces.find((f) => f.printed === code);
      expect(found).toBeDefined();
      expect(found!.url).toContain("cardimg/dcd/");
    }
  });
});
