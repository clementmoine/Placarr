import { describe, expect, it } from "vitest";

import { isPackDocumentKind } from "@/lib/shared/packDocumentKinds";

import { LECLERC_OPS } from "../pack";
import { selectLeclercSteps } from "../extract";
import { loadLeclercCuratedDocuments } from "./documents";

describe("documents Leclerc", () => {
  it("chaque document déclaré cite une URL ouverte et un type connu", () => {
    let total = 0;
    for (const op of LECLERC_OPS) {
      for (const doc of loadLeclercCuratedDocuments(op.setCode)) {
        total += 1;
        expect(doc.url, op.setCode).toMatch(/^https:\/\//);
        expect(isPackDocumentKind(doc.kind), `${op.setCode} ${doc.url}`).toBe(
          true,
        );
        expect(doc.title?.trim(), doc.url).toBeTruthy();
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(loadLeclercCuratedDocuments("disney26").length).toBeGreaterThan(0);
    expect(
      loadLeclercCuratedDocuments("sw15").some((doc) =>
        doc.url.includes("recevez_jetons_stars_wars"),
      ),
    ).toBe(true);
    // Chaque op connue a au moins un document (passe sources 2026-11-22).
    for (const op of LECLERC_OPS) {
      expect(
        loadLeclercCuratedDocuments(op.setCode).length,
        op.setCode,
      ).toBeGreaterThan(0);
    }
  });

  it("la Sync a une étape documents (réseau)", () => {
    expect(selectLeclercSteps([])).toContain("documents");
    expect(selectLeclercSteps(["--offline"])).not.toContain("documents");
  });
});
