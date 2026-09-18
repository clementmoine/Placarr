/**
 * Coleka Ultra Challenge — parse + install (Flare listing mocked via staging).
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { packCardsDir } from "@/lib/packPaths";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";

import { installColekaUltraFaces } from "./colekaUltraFaces";
import {
  colekaUltraFaceUrl,
  colekaUltraThumbCorroborates,
  colekaUltraThumbIsPlaceholder,
  colekaUltraTitleCorroborates,
  parseColekaUltraListing,
  parseColekaUltraRef,
} from "./parseColekaUltra";
import { NARUTO_ULTRA_PACK_ID } from "./pack";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "coleka-ultra-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

function item(opts: {
  ref: string;
  title: string;
  thumb: string;
  href?: string;
}): string {
  return `<a class="lib_has_2_lines" href="${opts.href ?? "/en/x"}">
    <img src="${opts.thumb}">
    <h3 class="product-title">${opts.title}</h3>
    <span class="ref"> Ref. ${opts.ref} </span>
  </a>`;
}

const FIXTURE = `
<ul>
${item({
  ref: "001",
  title: "Carte n°1",
  thumb:
    "https://thumbs.coleka.com/media/item/202105/07/naruto-ultra-challenge-carte-n-1-001_250x250.webp",
})}
${item({
  ref: "100",
  title: "Carte n°100",
  thumb:
    "https://thumbs.coleka.com/media/item/202103/24/naruto-ultra-challenge-panini-naruto-ultra-challenge-100-100_250x250.webp",
})}
${item({
  ref: "099",
  title: "Carte n°99",
  thumb:
    "https://thumbs.coleka.com/media/item/202105/07/naruto-ultra-challenge-carte-n-99-099_250x250.webp",
})}
${item({
  ref: "050",
  title: "Mismatch",
  thumb:
    "https://thumbs.coleka.com/media/item/202105/07/naruto-ultra-challenge-carte-n-99-099_250x250.webp",
})}
${item({
  ref: "005",
  title: "Carte n°5",
  thumb:
    "https://thumbs.coleka.com/media/item/202103/23/cartes-panini-naruto-sakura_250x250.webp",
})}
${item({
  ref: "001",
  title: "Album",
  thumb:
    "https://thumbs.coleka.com/media/item/202103/24/naruto-ultra-challenge-new-item_250x250.webp",
})}
</ul>
`;

describe("parseColekaUltra", () => {
  it("mappe Ref. + fichier ou titre, refuse gabarit 100 et mismatch, ignore l’album", () => {
    expect(parseColekaUltraRef("001")).toEqual({
      printed: "1",
      number: "0001",
    });
    expect(parseColekaUltraRef("101")).toBeNull();
    expect(
      colekaUltraThumbCorroborates(
        "https://thumbs.coleka.com/x/naruto-ultra-challenge-carte-n-1-001_250x250.webp",
        "1",
      ),
    ).toBe(true);
    expect(colekaUltraTitleCorroborates("Carte n°5", "5")).toBe(true);
    expect(
      colekaUltraThumbIsPlaceholder(
        "https://thumbs.coleka.com/media/item/202103/24/naruto-ultra-challenge-panini-naruto-ultra-challenge-100-100_250x250.webp",
      ),
    ).toBe(true);
    expect(
      colekaUltraFaceUrl(
        "https://thumbs.coleka.com/x/naruto-ultra-challenge-carte-n-1-001_250x250.webp",
      ),
    ).toBe(
      "https://thumbs.coleka.com/x/naruto-ultra-challenge-carte-n-1-001.webp",
    );

    const parsed = parseColekaUltraListing(FIXTURE);
    expect(parsed.cards.map((c) => c.number)).toEqual([
      "0001",
      "0005",
      "0099",
    ]);
    expect(parsed.rejected.some((r) => /gabarit/i.test(r.reason))).toBe(true);
    expect(parsed.rejected.some((r) => r.name === "Mismatch")).toBe(true);
    expect(parsed.rejected.some((r) => /album/i.test(r.reason))).toBe(true);
  });
});

describe("installColekaUltraFaces", () => {
  it("pose art.coleka.webp et purge le gabarit 100 de l'index", () => {
    tmpDataRoot();
    const staging = mkdtempSync(path.join(os.tmpdir(), "coleka-ultra-stage-"));
    roots.push(staging);
    writeFileSync(path.join(staging, "listing-0.html"), FIXTURE);
    writeFileSync(path.join(staging, "0001.webp"), Buffer.from("coleka-1"));
    writeFileSync(path.join(staging, "0099.webp"), Buffer.from("coleka-99"));

    const index = createLocalPrintsIndex(NARUTO_ULTRA_PACK_ID);
    index.writePrints([
      {
        printKey: "naruto:uc-0001",
        setCode: "uc",
        number: "0001",
        cardType: "uc",
        titles: [{ lang: "fr", fullName: "Naruto" }],
      },
      {
        printKey: "naruto:uc-0005",
        setCode: "uc",
        number: "0005",
        cardType: "uc",
        titles: [{ lang: "fr", fullName: "Sakura" }],
      },
      {
        printKey: "naruto:uc-0099",
        setCode: "uc",
        number: "0099",
        cardType: "uc",
        titles: [{ lang: "fr", fullName: "Jiraiya" }],
      },
      {
        printKey: "naruto:uc-0100",
        setCode: "uc",
        number: "0100",
        cardType: "uc",
        titles: [{ lang: "fr", fullName: "X" }],
      },
    ]);
    writeFileSync(path.join(staging, "0005.webp"), Buffer.from("coleka-5"));
    index.writeAssets([
      {
        printKey: "naruto:uc-0100",
        lang: "fr",
        art: "art.coleka.webp",
      },
    ]);

    const report = installColekaUltraFaces(index, { stagingDir: staging });
    expect(report.faces).toBe(3);
    expect(report.purgedPlaceholders).toEqual(["0100"]);
    expect(report.missing).toEqual([]);
    const art = path.join(
      packCardsDir(NARUTO_ULTRA_PACK_ID),
      "uc",
      "fr",
      "0001",
      "art.coleka.webp",
    );
    expect(existsSync(art)).toBe(true);
    expect(readFileSync(art, "utf8")).toBe("coleka-1");
    expect(index.lookupRow("naruto:uc-0001")?.art).toBe("art.coleka.webp");
    expect(index.lookupRow("naruto:uc-0100")?.art).toBeNull();
  });
});
