import { describe, expect, it } from "vitest";

import { hinokunianPages } from "./scrapeHinokunian";

describe("hinokunianPages", () => {
  const pages = hinokunianPages();

  it("porte les 53 pages du relevé", () => {
    expect(pages).toHaveLength(53);
    expect(pages.every((p) => p.path.endsWith(".html"))).toBe(true);
    expect(pages.every((p) => p.label.length > 0)).toBe(true);
  });

  it("couvre les quinze volumes et les quatre vagues arcade", () => {
    const volumes = pages.filter((p) =>
      /^cardgamemakino\d+\.html$/.test(p.path),
    );
    expect(volumes).toHaveLength(15);
    const arcade = pages.filter((p) => /^cardbattle\d\.html$/.test(p.path));
    expect(arcade).toHaveLength(4);
  });

  it("ne déclare jamais deux fois le même chemin", () => {
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
  });
});
