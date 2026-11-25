/**
 * La Sync tcgdex parle dans le journal admin : chaque étape s'annonce, et la
 * progression que la moisson sait déjà donner y remonte. Sans cela le job
 * tournait des minutes sans une ligne — impossible de distinguer « ça avance »
 * de « c'est bloqué ».
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harvest = vi.fn();
const enrich = vi.fn();
const logos = vi.fn();
const fullset = vi.fn();

vi.mock("./scrapeCards", () => ({
  harvestTcgdexCatalogue: (opts: unknown) => harvest(opts),
}));
vi.mock("./setLogos", () => ({
  ensureTcgdexSetLogoIndex: (opts: unknown) => logos(opts),
}));
vi.mock("./enrichCardDetails", () => ({
  enrichTcgdexCardDetails: (opts: unknown) => enrich(opts),
  TCGDEX_DETAIL_ENRICH_AUTO_LIMIT: 10,
  TCGDEX_DETAIL_ENRICH_FORCE_LIMIT: 100,
}));
vi.mock("@/providers/shared/fullset/harvestSets", () => ({
  harvestFullsetSets: (opts: unknown) => fullset(opts),
}));
vi.mock("./scrape/fullset/applyFullsetSetTitles", () => ({
  applyFullsetPokemonSetTitles: () => ({
    matched: 3,
    updated: 1,
    unmatched: 0,
  }),
}));

import { refreshTcgdexCatalog } from "./catalog";

let root = "";
let lines: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "tcgdex-refresh-"));
  vi.stubEnv("PLACARR_DATA_DIR", root);
  lines = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  harvest.mockImplementation(
    async (opts: { onProgress?: (m: string) => void }) => {
      opts.onProgress?.("fr : 180 sets annoncés");
      return { sets: 180, prints: 25000, titles: 50000 };
    },
  );
  enrich.mockImplementation(
    async (opts: { onProgress?: (m: string) => void }) => {
      opts.onProgress?.("Pokémon détails : 12 titres sans rareté…");
      return { patched: 12 };
    },
  );
  logos.mockResolvedValue(null);
  fullset.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("refreshTcgdexCatalog logs", () => {
  it("announces each step and relays the harvest progress", async () => {
    await refreshTcgdexCatalog();

    const log = lines.join("\n");
    expect(log).toMatch(/── tcgdex : sets/);
    expect(log).toContain("fr : 180 sets annoncés");
    expect(log).toMatch(/── tcgdex : logos/);
    expect(log).toMatch(/── tcgdex : détails/);
    expect(log).toContain("12 titres sans rareté");
    expect(log).toMatch(/── tcgdex : titres FR/);
    expect(log).toMatch(/── tcgdex : terminé .*180 sets/);
  });

  it("says why an optional step was skipped instead of swallowing it", async () => {
    logos.mockRejectedValue(new Error("CDN down"));
    fullset.mockRejectedValue(new Error("fullset 503"));

    await refreshTcgdexCatalog();

    const log = lines.join("\n");
    expect(log).toContain("CDN down");
    expect(log).toContain("fullset 503");
  });

  it("stops between steps once the job is cancelled", async () => {
    const controller = new AbortController();
    harvest.mockImplementation(async () => {
      controller.abort(new Error("cancelled"));
      return { sets: 1, prints: 1, titles: 1 };
    });

    await expect(
      refreshTcgdexCatalog({ signal: controller.signal }),
    ).rejects.toThrow();
    expect(enrich).not.toHaveBeenCalled();
  });
});
