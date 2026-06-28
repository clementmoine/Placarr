import { describe, expect, it } from "vitest";

import { chasseCoverDownloadCandidates } from "./coverUrl";

describe("chasseCoverDownloadCandidates", () => {
  it("propose des tailles explicites avant l'URL nue", () => {
    const base =
      "https://img.chasse-aux-livres.fr/v7/photo/1129169491.jpg";
    const candidates = chasseCoverDownloadCandidates(base);

    expect(candidates[0]).toBe(base);
    expect(candidates).toContain(`${base}?w=1200&h=1200`);
    expect(candidates.at(-1)).toBe(`${base}?w=600&h=600`);
  });
});
