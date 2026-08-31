import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import {
  colekaBackOnlyStagingFile,
  installColekaNinjaRanks,
  readColekaNinjaRanksLedger,
} from "./colekaNinjaRanks";
import { NARUTO_RANKS_PACK_ID } from "./pack";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coleka-nr-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("colekaBackOnlyStagingFile", () => {
  it("range le verso attesté sur fiche item sous le numéro de tirage", () => {
    expect(
      colekaBackOnlyStagingFile(
        "0003",
        "https://www.coleka.com/media/item/202205/23/coleka-carte-panini-naruto.webp",
      ),
    ).toBe("0003-back.webp");
  });
});

describe("readColekaNinjaRanksLedger", () => {
  it("documente le verso FR de la carte de base 3, pas GS03/bl-0003", () => {
    const row = readColekaNinjaRanksLedger().backOnly?.find(
      (entry) => entry.number === "0003",
    );
    expect(row).toMatchObject({
      setCode: "nr",
      colekaRef: 3,
      colekaId: "1188740",
      pageUrl: expect.stringContaining("groupe-7-kakashi-sasuke_i1188740"),
    });
    expect(row!.backUrl).toContain("coleka-carte-panini-naruto.webp");
  });
});

describe("installColekaNinjaRanks", () => {
  it("pose un verso seul sur le set attesté, sans inventer de recto", () => {
    tmpDataRoot();
    const staging = path.join(os.tmpdir(), `coleka-nr-install-${Date.now()}`);
    roots.push(staging);
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, "0003-back.webp"), "fake-back");

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    index.writePrints([
      {
        printKey: "naruto:nr-0003",
        setCode: "nr",
        number: "0003",
        cardType: "nr",
        titles: [
          { lang: "en", fullName: "Group 7 puzzle" },
          { lang: "fr", fullName: "Groupe 7 puzzle" },
        ],
      },
    ]);

    const report = installColekaNinjaRanks(index, { stagingDir: staging });
    expect(report).toMatchObject({ faces: 0, backs: 1, missing: [] });

    const cardDir = path.join(
      process.env.PLACARR_DATA_DIR!,
      "naruto",
      "ninja-ranks",
      "cards",
      "nr",
      "fr",
      "0003",
    );
    expect(fs.existsSync(path.join(cardDir, "back.coleka.webp"))).toBe(true);
    expect(fs.existsSync(path.join(cardDir, "art.coleka.webp"))).toBe(false);

    const exported = index.exportIndex();
    const entry = (
      JSON.parse(fs.readFileSync(exported!.path, "utf8")) as {
        cards: Record<
          string,
          { langs: Record<string, { art?: string; back?: string }> }
        >;
      }
    ).cards["naruto:nr-0003"];
    expect(entry.langs.fr?.back).toBe("back.coleka.webp");
    expect(entry.langs.fr?.art).toBeUndefined();
  });

  it("refuse un recto Coleka reflété et le retire de l'index", () => {
    tmpDataRoot();
    const staging = path.join(os.tmpdir(), `coleka-nr-reject-${Date.now()}`);
    roots.push(staging);
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(
      path.join(staging, "listing-0.html"),
      `<a class="lib_has_2_lines" href="/x"><img src="https://thumbs.coleka.com/media/item/x/naruto-ninja-ranks-carte-ff2-ff02_250x250.webp"><h3 class="product-title">FF2</h3><span class="ref"> Ref. FF02 </span></a>`,
    );
    fs.writeFileSync(path.join(staging, "ff-0002.webp"), "fake-front");

    const ledgerPath = path.join(
      process.cwd(),
      "src/providers/narutoranks/curated/sources/coleka-ninja-ranks.json",
    );
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as {
      rejectedFaces?: { setCode?: string; number: string; reason?: string }[];
    };
    const hadRejected = ledger.rejectedFaces?.some(
      (row) => row.setCode === "ff" && row.number === "0002",
    );
    if (!hadRejected) {
      ledger.rejectedFaces = [
        ...(ledger.rejectedFaces ?? []),
        { setCode: "ff", number: "0002", reason: "test" },
      ];
      fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
    }

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    index.writePrints([
      {
        printKey: "naruto:ff-0002",
        setCode: "ff",
        number: "0002",
        cardType: "ff",
        titles: [{ lang: "en", fullName: "Naruto - Fox Spirit" }],
      },
    ]);
    index.writeAssets([
      {
        printKey: "naruto:ff-0002",
        lang: "fr",
        art: "art.coleka.webp",
      },
    ]);

    const cardDir = path.join(
      process.env.PLACARR_DATA_DIR!,
      "naruto",
      "ninja-ranks",
      "cards",
      "ff",
      "fr",
      "0002",
    );
    fs.mkdirSync(cardDir, { recursive: true });
    fs.writeFileSync(path.join(cardDir, "art.coleka.webp"), "old-glare");

    const report = installColekaNinjaRanks(index, { stagingDir: staging });
    expect(report.faces).toBe(0);
    expect(fs.existsSync(path.join(cardDir, "art.coleka.webp"))).toBe(true);

    const exported = index.exportIndex();
    const entry = (
      JSON.parse(fs.readFileSync(exported!.path, "utf8")) as {
        cards: Record<string, { langs: Record<string, { art?: string }> }>;
      }
    ).cards["naruto:ff-0002"];
    expect(entry.langs.fr?.art).toBeUndefined();
  });

  it("pose un insert EU sous le bon set", () => {
    tmpDataRoot();
    const staging = path.join(os.tmpdir(), `coleka-nr-insert-${Date.now()}`);
    roots.push(staging);
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(
      path.join(staging, "listing-0.html"),
      `<a class="lib_has_2_lines" href="/x"><img src="https://thumbs.coleka.com/media/item/x/naruto-ninja-ranks-carte-ff1-ff01_250x250.webp"><h3 class="product-title">FF1</h3><span class="ref"> Ref. FF01 </span></a>`,
    );
    fs.writeFileSync(path.join(staging, "ff-0001.webp"), "fake-front");

    const index = createLocalPrintsIndex(NARUTO_RANKS_PACK_ID);
    index.writePrints([
      {
        printKey: "naruto:ff-0001",
        setCode: "ff",
        number: "0001",
        cardType: "ff",
        titles: [{ lang: "en", fullName: "Flash Forward 1" }],
      },
    ]);

    const report = installColekaNinjaRanks(index, { stagingDir: staging });
    expect(report).toMatchObject({ faces: 1, backs: 0 });
    expect(report.missing).not.toContain("ff-0001");

    const cardDir = path.join(
      process.env.PLACARR_DATA_DIR!,
      "naruto",
      "ninja-ranks",
      "cards",
      "ff",
      "fr",
      "0001",
    );
    expect(fs.existsSync(path.join(cardDir, "art.coleka.webp"))).toBe(true);
  });
});
