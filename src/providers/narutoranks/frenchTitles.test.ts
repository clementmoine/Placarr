import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { packCatalogDb } from "@/lib/packPaths";

import { buildNinjaRanksFromLedgers } from "./buildFromLedgers";
import { buildFrenchNinjaRanksTitles } from "./frenchTitles";
import { NARUTO_RANKS_PACK_ID } from "./pack";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ninja-ranks-fr-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

function localeTitle(printKey: string, lang: string): string | null {
  const db = new DatabaseSync(packCatalogDb(NARUTO_RANKS_PACK_ID), {
    readOnly: true,
  });
  try {
    const row = db
      .prepare(
        `SELECT full_name FROM print_titles WHERE print_key = ? AND lang = ?`,
      )
      .get(printKey, lang) as { full_name: string } | undefined;
    return row?.full_name ?? null;
  } finally {
    db.close();
  }
}

const frenchTitle = (printKey: string) => localeTitle(printKey, "fr");

describe("buildFrenchNinjaRanksTitles", () => {
  it("writes attested locale titles then fills shared names from English", () => {
    tmpDataRoot();
    buildNinjaRanksFromLedgers();
    const report = buildFrenchNinjaRanksTitles();
    // 72 FR checklist + 2 FR hors base (ff-2, sd-5) + IT attestés (nr + ff).
    expect(report.ledgerRows).toBe(72);
    expect(report.languageSpecificRows).toBeGreaterThanOrEqual(2);
    expect(report.titles).toBe(report.ledgerRows + report.languageSpecificRows);
    expect(report.sharedFromEnglish).toBeGreaterThan(0);
    expect(report.skipped).toEqual([]);
    expect(report.missing).toEqual([]);

    expect(frenchTitle("naruto:nr-0001")).toBe("Et voici les ninjas !");
    expect(frenchTitle("naruto:nr-0044")).toBe("Gaï");
    expect(frenchTitle("naruto:nr-0058")).toBe("Hokage le 3e");
    expect(frenchTitle("naruto:nr-0066")).toBe("Groupe de Konohamaru");
    expect(frenchTitle("naruto:nr-0068")).toBe("Second Examen des Survivants");
    expect(frenchTitle("naruto:nr-0070")).toBe("Kakashi-Zabuza");
    expect(frenchTitle("naruto:nr-0071")).toBe("Carte");
    expect(frenchTitle("naruto:nr-0057")).toBe("Dosu");
    expect(frenchTitle("naruto:ff-0001")).toBe("Guy - Kakashi");
    expect(frenchTitle("naruto:ff-0002")).toBe("DEMON-RENARD");
    expect(frenchTitle("naruto:sd-0005")).toBe("HOKAGE LE 4E");
    expect(frenchTitle("naruto:nw-0001")).toBe("Naruto");
    expect(frenchTitle("naruto:nw-0009")).toBe("Rock lee");

    expect(localeTitle("naruto:nr-0002", "it")).toBe("GRUPPO 7");
    expect(localeTitle("naruto:ff-0002", "it")).toBe("VOLPE A 9 CODE");
    expect(localeTitle("naruto:nw-0001", "it")).toBe("Naruto");

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    expect(index.lookupRow("naruto:nr-0001")?.fullName).toBe("Title Card");
    expect(
      index.lookupRow("naruto:ff-0002", { language: "fr" })?.fullName,
    ).toBe("DEMON-RENARD");
  });
});
