import { describe, expect, it } from "vitest";

import { germanSealedReleases, germanSetCode } from "./germanSealedReleases";

describe("germanSetCode", () => {
  it("lit la série dans le slug", () => {
    expect(germanSetCode("booster-s4-de")).toBe("s4");
    expect(germanSetCode("display-s3-de")).toBe("s3");
    expect(germanSetCode("booster-s9-de")).toBe("s9");
  });

  it("ne se déclenche pas sur un slug d'une autre langue", () => {
    expect(germanSetCode("booster-s1-it")).toBeNull();
    expect(germanSetCode("booster-s1")).toBeNull();
  });
});

describe("germanSealedReleases", () => {
  const rows = germanSealedReleases();

  /*
    Le catalogue ne portait **rien** en allemand — ni carte, ni produit — alors
    que la ligne existe : neuf séries de boosters, plus au moins un display.
  */
  it("rend les neuf boosters et le display", () => {
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.kind === "booster")).toHaveLength(9);
    expect(rows.filter((r) => r.kind === "display")).toHaveLength(1);
    expect(rows.every((r) => r.lang === "DE" && r.attested)).toBe(true);
  });

  it("donne au display son propre nom, pas celui du booster", () => {
    // La page servait le même `og:title` pour les deux.
    const display = rows.find((r) => r.kind === "display");
    expect(display?.name).toContain("Display");
    expect(display?.slug).toBe("display-s3-de");
  });

  it("nomme un fichier de staging par SKU, sans collision", () => {
    expect(rows.every((r) => r.stagingFile === `${r.slug}.png`)).toBe(true);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
  });
});
