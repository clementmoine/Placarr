/**
 * AnimeCollection Ultra Challenge faces — parse + install (no live download).
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

import {
  animeCollectionFaceUrl,
  installAnimeCollectionFaces,
  parseAnimeCollectionUltraFaces,
  readAnimeCollectionFacesLedger,
} from "./animecollectionFaces";
import { NARUTO_ULTRA_PACK_ID } from "./pack";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "ac-ultra-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

const FIXTURE = `
<td class="bloc_carte"><a name="c9771"></a>
<div class="bc_cadre" style="padding-bottom:1px;">
	<div class="bc_cadre_numero" title="Normal" style="background:transparent url(images/titres_cartes/orange.jpg) repeat-x;"><div class="bc_texte_numero">01</div></div>
	<div class="bc_cadre_carte"><img id="img_9771" src="cartes/113/254/h100_9771_carte.jpg" /></div>
</div>
</td>
<td class="bloc_carte"><a name="c9772"></a>
<div class="bc_cadre" style="padding-bottom:1px;">
	<div class="bc_cadre_numero" title="Normal"><div class="bc_texte_numero">02</div></div>
	<div class="bc_cadre_carte"><img id="img_9772" src="cartes/113/254/h100_9772_carte.jpg" /></div>
</div>
</td>
<td class="bloc_carte"><a name="c9877"></a>
<div class="bc_cadre" style="padding-bottom:1px;">
	<div class="bc_cadre_numero" title="Checklist"><div class="bc_texte_numero">Checklist </div></div>
	<div class="bc_cadre_carte"><img id="img_9877" src="cartes/113/254/h100_9877_carte.jpg" /></div>
</div>
</td>
`;

describe("parseAnimeCollectionUltraFaces", () => {
  it("mappe le numéro imprimé à l’acId et ignore la checklist", () => {
    expect(parseAnimeCollectionUltraFaces(FIXTURE)).toEqual([
      { printed: "1", number: "0001", acId: "9771" },
      { printed: "2", number: "0002", acId: "9772" },
    ]);
  });
});

describe("ledger AnimeCollection faces", () => {
  it("porte les cent cartes, alignées sur la checklist laststicker", () => {
    const ledger = readAnimeCollectionFacesLedger();
    expect(ledger.sourceId).toBe("animecollection");
    expect(ledger.faces).toHaveLength(100);
    expect(ledger.faces[0]).toEqual({
      printed: "1",
      number: "0001",
      acId: "9771",
    });
    expect(ledger.faces[96]).toMatchObject({
      printed: "97",
      number: "0097",
      acId: "9880",
    });
    expect(ledger.faces[99]).toEqual({
      printed: "100",
      number: "0100",
      acId: "9876",
    });
    expect(animeCollectionFaceUrl(ledger, "9771")).toBe(
      "http://www.animecollection.fr/cartes/113/254/h400_9771_carte.jpg",
    );
  });
});

describe("installAnimeCollectionFaces", () => {
  it("pose art.animecollection.jpg sous cards/uc/fr/{number}/", () => {
    tmpDataRoot();
    const staging = mkdtempSync(path.join(os.tmpdir(), "ac-stage-"));
    roots.push(staging);
    writeFileSync(path.join(staging, "0001.jpg"), Buffer.from("fake-jpeg-1"));
    writeFileSync(path.join(staging, "0002.jpg"), Buffer.from("fake-jpeg-2"));

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
        printKey: "naruto:uc-0002",
        setCode: "uc",
        number: "0002",
        cardType: "uc",
        titles: [{ lang: "fr", fullName: "Naruto" }],
      },
    ]);

    const report = installAnimeCollectionFaces(index, { stagingDir: staging });
    expect(report.faces).toBe(2);
    expect(report.missing).toHaveLength(98);

    const art1 = path.join(
      packCardsDir(NARUTO_ULTRA_PACK_ID),
      "uc",
      "fr",
      "0001",
      "art.animecollection.jpg",
    );
    expect(existsSync(art1)).toBe(true);
    expect(readFileSync(art1, "utf8")).toBe("fake-jpeg-1");
    expect(index.lookupRow("naruto:uc-0001")?.art).toBe(
      "art.animecollection.jpg",
    );
  });
});
