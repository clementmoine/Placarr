import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  installDataCarddassReconstructedFaces,
  listCuratedDataCarddassFaces,
  readDataCarddassReconstructedFacesLedger,
} from "./installReconstructedFaces";
import { NARUTO_DATA_CARDDASS_PACK_ID } from "../pack";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("installDataCarddassReconstructedFaces", () => {
  let curatedRoot = "";
  let dataDir = "";
  let previousData: string | undefined;

  const curatedCard = (setCode: string, lang: string, number: string) =>
    path.join(curatedRoot, "cards", setCode, lang, number);

  const installedCard = (setCode: string, lang: string, number: string) =>
    path.join(dataDir, NARUTO_DATA_CARDDASS_PACK_ID, "cards", setCode, lang, number);

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
        grouping: null,
        category: null,
        titles: [{ lang: "ja", fullName }],
      },
    ]);
  };

  beforeEach(() => {
    curatedRoot = mkdtempSync(path.join(tmpdir(), "dcd-curated-"));
    dataDir = mkdtempSync(path.join(tmpdir(), "dcd-data-"));
    previousData = process.env.PLACARR_DATA_DIR;
    process.env.PLACARR_DATA_DIR = dataDir;
  });

  afterEach(() => {
    process.env.PLACARR_DATA_DIR = previousData;
    rmSync(curatedRoot, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("lists curated reconstructed faces by scanning folder tree", () => {
    writeCurated("dn", "ja", "141t", "art.reconstructed.png");
    const discovered = listCuratedDataCarddassFaces(curatedRoot);
    expect(discovered).toEqual([
      {
        setCode: "dn",
        lang: "ja",
        number: "141t",
        artSource: path.join(curatedCard("dn", "ja", "141t"), "art.reconstructed.png"),
      },
    ]);
  });

  it("installs curated faces as art.reconstructed.webp and writes index assets", async () => {
    writeCurated("dn", "ja", "141t", "source.png");

    const index = createLocalPrintsIndex(NARUTO_DATA_CARDDASS_PACK_ID);
    seedPrint(index, "datacarddass:dn-141t", "dn", "141t", "うずまきナルト");

    const report = await installDataCarddassReconstructedFaces({
      index,
      curatedRoot,
    });

    expect(report.written).toEqual(["dn/ja/141t"]);
    expect(report.failed).toEqual([]);

    const destPath = path.join(installedCard("dn", "ja", "141t"), "art.reconstructed.webp");
    expect(existsSync(destPath)).toBe(true);

    const row = index.lookupRow("datacarddass:dn-141t");
    expect(row?.art).toBe("art.reconstructed.webp");
  });

  it("reads reconstructed ledger when present", () => {
    const sourcesDir = path.join(curatedRoot, "sources");
    mkdirSync(sourcesDir, { recursive: true });
    writeFileSync(
      path.join(sourcesDir, "reconstructed-faces.json"),
      JSON.stringify({
        sourceId: "reconstructed",
        faces: [
          {
            setCode: "dn",
            number: "141t",
            printed: "DN-141T",
            sourceFile: "cards/dn/ja/141t/art.reconstructed.png",
          },
        ],
      }),
    );

    const ledger = readDataCarddassReconstructedFacesLedger(curatedRoot);
    expect(ledger.faces.length).toBe(1);
    expect(ledger.faces[0]?.printed).toBe("DN-141T");
  });
});
