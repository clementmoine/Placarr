import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CURATED_DOCUMENTS_STAGED_REL,
  loadCarddassCuratedDocuments,
} from "./documents";

const CURATED_DIR = path.dirname(fileURLToPath(import.meta.url));

describe("carddass curated documents", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "placarr-carddass-docs-"));
    vi.stubEnv("PLACARR_DATA_DIR", dataDir);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("lists S5 reconstructed poster face + back as FR checklists", () => {
    const docs = loadCarddassCuratedDocuments();
    const posters = docs.filter((d) =>
      /poster_s5_(face|back)\.png$/i.test(d.localPath ?? ""),
    );
    expect(posters).toHaveLength(2);
    expect(posters.every((d) => d.lang === "fr")).toBe(true);
    expect(posters.every((d) => d.kind === "checklist")).toBe(true);
    expect(posters.map((d) => d.title).sort()).toEqual([
      "Poster Série 5 — dos (starters, 50 cartes)",
      "Poster Série 5 — face (boosters, 92 cartes)",
    ]);
  });

  it("stages curated/documents binaries under sources/curated-documents", async () => {
    const { stageCarddassCuratedDocumentFiles: stage } = await import(
      "./documents"
    );
    const report = stage();
    expect(report.staged).toEqual(
      expect.arrayContaining([
        `${CURATED_DOCUMENTS_STAGED_REL}/poster_s5_face.png`,
        `${CURATED_DOCUMENTS_STAGED_REL}/poster_s5_back.png`,
      ]),
    );
    const dest = path.join(
      dataDir,
      "naruto/carddass",
      CURATED_DOCUMENTS_STAGED_REL,
    );
    expect(existsSync(path.join(dest, "poster_s5_face.png"))).toBe(true);
    expect(existsSync(path.join(dest, "poster_s5_back.png"))).toBe(true);
  });

  it("keeps hand-made poster PNGs committed under curated/documents", () => {
    const dir = path.join(CURATED_DIR, "documents");
    const names = readdirSync(dir).filter((n) => n.endsWith(".png")).sort();
    expect(names).toEqual(["poster_s5_back.png", "poster_s5_face.png"]);
  });
});
