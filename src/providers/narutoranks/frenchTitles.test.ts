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

function frenchTitle(printKey: string): string | null {
  const db = new DatabaseSync(packCatalogDb(NARUTO_RANKS_PACK_ID), {
    readOnly: true,
  });
  try {
    const row = db
      .prepare(
        `SELECT full_name FROM print_titles WHERE print_key = ? AND lang = 'fr'`,
      )
      .get(printKey) as { full_name: string } | undefined;
    return row?.full_name ?? null;
  } finally {
    db.close();
  }
}

describe("buildFrenchNinjaRanksTitles", () => {
  it("writes all 72 French base titles from checklist sources", () => {
    tmpDataRoot();
    buildNinjaRanksFromLedgers();
    const report = buildFrenchNinjaRanksTitles();
    expect(report).toMatchObject({
      ledgerRows: 72,
      titles: 72,
      skipped: [],
      missing: [],
    });

    expect(frenchTitle("naruto:nr-0001")).toBe("Et voici les ninjas !");
    expect(frenchTitle("naruto:nr-0044")).toBe("Gaï");
    expect(frenchTitle("naruto:nr-0058")).toBe("Hokage le 3e");
    expect(frenchTitle("naruto:nr-0066")).toBe("Groupe de Konohamaru");
    expect(frenchTitle("naruto:nr-0068")).toBe(
      "Second Examen des Survivants",
    );
    expect(frenchTitle("naruto:nr-0070")).toBe("Kakashi-Zabuza");
    expect(frenchTitle("naruto:nr-0071")).toBe("Carte");
    expect(frenchTitle("naruto:nr-0057")).toBe("Dosu");
    expect(frenchTitle("naruto:ff-0001")).toBeNull();

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    expect(index.lookupRow("naruto:nr-0001")?.fullName).toBe("Title Card");
  });
});
