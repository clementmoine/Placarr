import { describe, expect, it } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { DBS_JCC_PACK_ID } from "../pack";
import {
  DBSJCC_DETECTEUR_PRINT_KEY,
  dbsjccSetLabel,
  dbsjccStarterIncludesDetecteur,
  formatDbsjccCollectorReference,
} from "../printKey";
import {
  installDbsjccDetecteur,
  isDbsjccDetecteurSealedSlug,
} from "./detecteur";

describe("dbsjcc Détecteur", () => {
  it("recognises sealed detector slugs and starter inclusion", () => {
    expect(isDbsjccDetecteurSealedSlug("part4-d-tecteur-253")).toBe(true);
    expect(isDbsjccDetecteurSealedSlug("part7-starter-1208")).toBe(false);
    expect(dbsjccStarterIncludesDetecteur("part4-starter-1200")).toBe(true);
    expect(dbsjccStarterIncludesDetecteur("part10-starter-1219")).toBe(true);
    expect(dbsjccStarterIncludesDetecteur("part3-starter-1197")).toBe(false);
    expect(dbsjccSetLabel("accessory")).toBe("Détecteur");
    expect(dbsjccSetLabel("promo")).toBe("Promo (hors série)");
    expect(formatDbsjccCollectorReference("accessory", "detecteur")).toBe(
      "Détecteur",
    );
  });

  it("installs FR + JA faces (Hatatoy Special Scouter)", async () => {
    const report = await installDbsjccDetecteur({ force: true });
    expect(report.print).toBe(true);
    expect(report.faceFr).toBe(true);
    expect(report.faceJa).toBe(true);
    expect(DBSJCC_DETECTEUR_PRINT_KEY).toBe("dbsjcc:accessory-detecteur");

    const index = createLocalPrintsIndex(DBS_JCC_PACK_ID);
    const ja = index.lookupRow(DBSJCC_DETECTEUR_PRINT_KEY, { language: "ja" });
    expect(ja?.fullName).toMatch(/スカウター/);
    const assets = index.lookupAssets(DBSJCC_DETECTEUR_PRINT_KEY, {
      preferLang: "ja",
    });
    expect(assets?.lang).toBe("ja");
    expect(assets?.art).toMatch(/hatatoy/);
  });
});
