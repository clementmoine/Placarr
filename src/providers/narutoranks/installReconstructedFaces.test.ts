import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  installReconstructedFaces,
  listCuratedReconstructedFaces,
} from "./installReconstructedFaces";
import { NARUTO_RANKS_PACK_ID } from "./pack";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/*
  Rien de ce test ne touche l'arbre curé ni le pack réels : `curatedRoot` est
  injecté, et `PLACARR_DATA_DIR` / `PLACARR_EFFECTS_DIR` déplacent la base et
  les faces dans un dossier jetable. Écrire un PNG de test dans
  `src/providers/narutoranks/curated/` écraserait un scan du catalogue.
*/
describe("installReconstructedFaces", () => {
  let curatedRoot = "";
  let dataDir = "";
  let previousData: string | undefined;
  let previousEffects: string | undefined;

  const curatedCard = (setCode: string, lang: string, number: string) =>
    path.join(curatedRoot, "cards", setCode, lang, number);

  const installedCard = (setCode: string, lang: string, number: string) =>
    path.join(dataDir, NARUTO_RANKS_PACK_ID, "cards", setCode, lang, number);

  const writeCurated = (
    setCode: string,
    lang: string,
    number: string,
    file: string,
  ) => {
    const dir = curatedCard(setCode, lang, number);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, file), TINY_PNG);
  };

  const seedPrint = (
    index: ReturnType<typeof createLocalPrintsIndex>,
    printKey: string,
    setCode: string,
    number: string,
    fullName: string,
  ) => {
    index.writePrints([
      {
        printKey,
        setCode,
        number,
        cardType: setCode,
        titles: [{ lang: "en", fullName }],
      },
    ]);
  };

  beforeEach(() => {
    curatedRoot = mkdtempSync(path.join(tmpdir(), "ranks-curated-"));
    dataDir = mkdtempSync(path.join(tmpdir(), "ranks-data-"));
    previousData = process.env.PLACARR_DATA_DIR;
    previousEffects = process.env.PLACARR_EFFECTS_DIR;
    process.env.PLACARR_DATA_DIR = dataDir;
    process.env.PLACARR_EFFECTS_DIR = dataDir;
  });

  afterEach(() => {
    if (previousData === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = previousData;
    if (previousEffects === undefined) delete process.env.PLACARR_EFFECTS_DIR;
    else process.env.PLACARR_EFFECTS_DIR = previousEffects;
    rmSync(curatedRoot, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("installs a face dropped in the tree with no ledger row, verso included", async () => {
    writeCurated("pn", "en", "p", "art.reconstructed.png");
    writeCurated("pn", "en", "p", "back.reconstructed.png");

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    seedPrint(index, "naruto:pn-p", "pn", "p", "SDCC PASSPORT PROGRAM");

    const report = await installReconstructedFaces(index, {
      force: true,
      curatedRoot,
      ledger: { sourceId: "reconstructed", lang: "en", faces: [] },
    });

    expect(report.faces).toBe(1);
    expect(report.backs).toBe(1);
    // Installée quand même — mais on dit qu'il manque son attestation.
    expect(report.unattested).toEqual(["pn-p"]);

    const dir = installedCard("pn", "en", "p");
    expect(existsSync(path.join(dir, "art.reconstructed.webp"))).toBe(true);
    expect(existsSync(path.join(dir, "back.reconstructed.webp"))).toBe(true);

    const row = index.lookupRow("naruto:pn-p", { language: "en" });
    expect(row?.art).toBe("art.reconstructed.webp");
    expect(row?.back).toBe("back.reconstructed.webp");
  });

  it("keeps the ledger as the attestation record", async () => {
    writeCurated("pn", "en", "i", "art.reconstructed.png");

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    seedPrint(index, "naruto:pn-i", "pn", "i", "FREE CARD OFFER ON INKWORKS.COM");

    const report = await installReconstructedFaces(index, {
      force: true,
      curatedRoot,
      ledger: {
        sourceId: "reconstructed",
        lang: "en",
        faces: [
          {
            setCode: "pn",
            number: "i",
            printed: "PN-i",
            sourceFile: "curated/cards/pn/en/i/art.reconstructed.png",
          },
        ],
      },
    });

    expect(report.faces).toBe(1);
    expect(report.unattested).toEqual([]);
    expect(index.lookupRow("naruto:pn-i", { language: "en" })?.art).toBe(
      "art.reconstructed.webp",
    );
  });

  it("reports a ledger row whose file is gone instead of writing a face", async () => {
    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    seedPrint(index, "naruto:pn-ga", "pn", "ga", "GAMA SHOW");

    const report = await installReconstructedFaces(index, {
      force: true,
      curatedRoot,
      ledger: {
        sourceId: "reconstructed",
        lang: "en",
        faces: [
          {
            setCode: "pn",
            number: "ga",
            printed: "PN-GA",
            sourceFile: "curated/cards/pn/en/ga/art.reconstructed.png",
          },
        ],
      },
    });

    expect(report.faces).toBe(0);
    expect(report.skipped).toEqual(["PN-GA"]);
    expect(existsSync(installedCard("pn", "en", "ga"))).toBe(false);
  });

  it("ignores files that belong to another installer", () => {
    writeCurated("bl", "fr", "0003", "art.coleka.png");
    writeCurated("pn", "en", "t", "source.webp");
    writeCurated("pn", "en", "t", "art.reconstructed.png");

    const found = listCuratedReconstructedFaces(curatedRoot);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ setCode: "pn", lang: "en", number: "t" });
    expect(found[0]?.backSource).toBeUndefined();
  });
});
