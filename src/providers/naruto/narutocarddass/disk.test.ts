import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NARUTO_FACE_PRIORITY, NARUTO_FACE_SOURCES, narutoDumpFaceRank, narutoFaceFilename, narutoFaceSourceOf, parseNarutoFaceDecision, pickBestNarutoDumpFace, narutoAssetsCardUrl, narutoCardPathFromCollector, narutoCardRelPath, normalizeNarutoLang, NARUTO_FACE_DECISION_FILE, existingNarutoArtForSource, saveNarutoFace, writeNarutoArtFile, isMarketplacePaddedImage, carddasJpVol1FaceOriginalUrls, carddasJpVol1FaceStem, carddasJpVol1FaceTargets, carddasJpVolumeFaceStem, waybackImageUrl } from "./disk";
import { canonicalizeNarutoPrintKey, mintNarutoPrintKey, narutoCollectorsMatch, narutoDiskCardId } from "./identity";
import sharp from "sharp";

// —— faceChoice ——
{
  describe("narutoFaceSourceOf", () => {
    it("reads art.<source>.<ext> dumps", () => {
      expect(narutoFaceSourceOf("art.suruga.jpg")).toBe("suruga");
      expect(narutoFaceSourceOf("art.nikita.png")).toBe("nikita");
      expect(narutoFaceSourceOf("art.vintage.webp")).toBe("vintage");
      expect(narutoFaceSourceOf("art.drive.webp")).toBe("drive");
      expect(narutoFaceSourceOf("art.carddass.jpg")).toBe("carddass");
      expect(narutoFaceSourceOf("art.ultrajeux.jpg")).toBe("ultrajeux");
      expect(narutoFaceSourceOf("art.ebay.webp")).toBe("ebay");
      expect(narutoFaceSourceOf("art.leboncoin.jpg")).toBe("leboncoin");
      expect(narutoFaceSourceOf("art.mercari.jpg")).toBe("mercari");
      expect(narutoFaceSourceOf("art.yahoo.jpg")).toBe("yahoo");
      expect(narutoFaceSourceOf("art.cardgameclub.jpg")).toBe("cardgameclub");
      expect(narutoFaceSourceOf("art.carddas.gif")).toBe("carddas");
      expect(narutoFaceSourceOf("art.carddas-a.png")).toBe("carddas-a");
      expect(narutoFaceSourceOf("art.carddas-b.png")).toBe("carddas-b");
      expect(narutoFaceSourceOf("art.narutocardgamegg.jpg")).toBe(
        "narutocardgamegg",
      );
      expect(narutoFaceSourceOf("art.fanset.webp")).toBe("fanset");
    });

    it("ranks variant A of an official double illustration above variant B", () => {
      expect(narutoDumpFaceRank("art.carddas-a.png", "ja")).toBeGreaterThan(
        narutoDumpFaceRank("art.carddas-b.png", "ja"),
      );
      expect(
        pickBestNarutoDumpFace(
          [
            {
              source: "carddas-a",
              file: "art.carddas-a.png",
              width: 185,
              height: 274,
            },
            {
              source: "carddas-b",
              file: "art.carddas-b.png",
              width: 185,
              height: 274,
            },
          ],
          "ja",
        ),
      ).toBe("carddas-a");
    });

    it("counts unsourced art.jpg as legacy, not a named dump", () => {
      expect(narutoFaceSourceOf("art.jpg")).toBe("legacy");
      expect(narutoFaceSourceOf("art.png")).toBe("legacy");
      expect(narutoFaceSourceOf("art.jpeg")).toBe("legacy");
    });

    it("does not treat reconstructed / corrected as dump sources", () => {
      expect(narutoFaceSourceOf("art.reconstructed.png")).toBeNull();
      expect(narutoFaceSourceOf("art.corrected.jpg")).toBeNull();
      expect(narutoFaceSourceOf("thumb.jpg")).toBeNull();
      expect(narutoFaceSourceOf("back.jpg")).toBeNull();
    });
  });

  describe("NARUTO_FACE_PRIORITY", () => {
    it("lists every dump source in every locale", () => {
      for (const [lang, list] of Object.entries(NARUTO_FACE_PRIORITY)) {
        expect(new Set(list), lang).toEqual(new Set(NARUTO_FACE_SOURCES));
      }
    });
  });

  describe("narutoDumpFaceRank", () => {
    it("prefers the locale dump on a size tie (filename order only)", () => {
      expect(narutoDumpFaceRank("art.nikita.jpg", "ja")).toBeGreaterThan(
        narutoDumpFaceRank("art.suruga.jpg", "ja"),
      );
      expect(narutoDumpFaceRank("art.vintage.jpg", "en")).toBeGreaterThan(
        narutoDumpFaceRank("art.goat.jpg", "en"),
      );
      expect(narutoDumpFaceRank("art.drive.jpg", "en")).toBeGreaterThan(
        narutoDumpFaceRank("art.vintage.jpg", "en"),
      );
      expect(narutoDumpFaceRank("art.carddass.jpg", "fr")).toBeGreaterThan(
        narutoDumpFaceRank("art.ultrajeux.jpg", "fr"),
      );
      expect(narutoDumpFaceRank("art.ultrajeux.jpg", "fr")).toBeGreaterThan(
        narutoDumpFaceRank("art.coleka.jpg", "fr"),
      );
      expect(narutoDumpFaceRank("art.coleka.jpg", "fr")).toBeGreaterThan(
        narutoDumpFaceRank("art.leboncoin.jpg", "fr"),
      );
      expect(narutoDumpFaceRank("art.leboncoin.jpg", "fr")).toBeGreaterThan(
        narutoDumpFaceRank("art.ebay.jpg", "fr"),
      );
      expect(narutoDumpFaceRank("art.coleka.jpg", "it")).toBeGreaterThan(
        narutoDumpFaceRank("art.ebay.jpg", "it"),
      );
      expect(narutoDumpFaceRank("art.ebay.jpg", "ja")).toBeGreaterThan(
        narutoDumpFaceRank("art.mercari.jpg", "ja"),
      );
      expect(narutoDumpFaceRank("art.mercari.jpg", "ja")).toBeGreaterThan(
        narutoDumpFaceRank("art.yahoo.jpg", "ja"),
      );
      expect(narutoDumpFaceRank("art.yahoo.jpg", "ja")).toBeGreaterThan(
        narutoDumpFaceRank("art.legacy.jpg", "ja"),
      );
      expect(narutoDumpFaceRank("art.legacy.jpg", "en")).toBeGreaterThan(
        narutoDumpFaceRank("art.fanset.jpg", "en"),
      );
    });
  });

  describe("parseNarutoFaceDecision", () => {
    it("accepts a named dump, unsourced art.jpg, and specials", () => {
      expect(
        parseNarutoFaceDecision(JSON.stringify({ art: "art.suruga.jpg" })),
      ).toBe("art.suruga.jpg");
      expect(parseNarutoFaceDecision(JSON.stringify({ art: "art.jpg" }))).toBe(
        "art.jpg",
      );
      expect(
        parseNarutoFaceDecision(JSON.stringify({ art: "art.reconstructed.png" })),
      ).toBe("art.reconstructed.png");
      expect(
        parseNarutoFaceDecision(JSON.stringify({ art: "art.corrected.jpg" })),
      ).toBe("art.corrected.jpg");
    });

    it("rejects thumbs and unknown names", () => {
      expect(
        parseNarutoFaceDecision(JSON.stringify({ art: "thumb.jpg" })),
      ).toBeNull();
      expect(parseNarutoFaceDecision("{")).toBeNull();
    });
  });

  describe("pickBestNarutoDumpFace", () => {
    it("picks pixels first, locale only on a tie", () => {
      expect(
        pickBestNarutoDumpFace(
          [
            { source: "nikita", file: "art.nikita.jpg", width: 200, height: 280 },
            { source: "suruga", file: "art.suruga.jpg", width: 400, height: 560 },
          ],
          "ja",
        ),
      ).toBe("suruga");
      expect(
        pickBestNarutoDumpFace(
          [
            { source: "nikita", file: "art.nikita.jpg", width: 400, height: 560 },
            { source: "suruga", file: "art.suruga.jpg", width: 400, height: 560 },
          ],
          "ja",
        ),
      ).toBe("nikita");
    });

    it("keeps the FR publisher raw over a larger Coleka photo", () => {
      expect(
        pickBestNarutoDumpFace(
          [
            {
              source: "carddass",
              file: "art.carddass.jpg",
              width: 350,
              height: 496,
            },
            {
              source: "coleka",
              file: "art.coleka.webp",
              width: 900,
              height: 1200,
            },
          ],
          "fr",
        ),
      ).toBe("carddass");
    });

    it("lets a larger Rakuten NOPAD beat a watermarked carddass raw on FR", () => {
      expect(
        pickBestNarutoDumpFace(
          [
            {
              source: "carddass",
              file: "art.carddass.jpg",
              width: 350,
              height: 496,
            },
            {
              source: "rakuten",
              file: "art.rakuten.jpg",
              width: 517,
              height: 740,
            },
          ],
          "fr",
        ),
      ).toBe("rakuten");
    });

    it("still uses Coleka on FR when no publisher scan is held", () => {
      expect(
        pickBestNarutoDumpFace(
          [
            {
              source: "coleka",
              file: "art.coleka.webp",
              width: 900,
              height: 1200,
            },
          ],
          "fr",
        ),
      ).toBe("coleka");
    });

    it("keeps any attested dump over a larger fanset remake", () => {
      expect(
        pickBestNarutoDumpFace(
          [
            {
              source: "vintage",
              file: "art.vintage.jpg",
              width: 80,
              height: 112,
            },
            {
              source: "fanset",
              file: "art.fanset.webp",
              width: 900,
              height: 1260,
            },
          ],
          "en",
        ),
      ).toBe("vintage");
    });

    it("uses the fanset scan when it is the only visual", () => {
      expect(
        pickBestNarutoDumpFace(
          [
            {
              source: "fanset",
              file: "art.fanset.webp",
              width: 750,
              height: 1050,
            },
          ],
          "en",
        ),
      ).toBe("fanset");
    });
  });

  describe("narutoFaceFilename", () => {
    it("keeps the source extension", () => {
      expect(narutoFaceFilename("suruga", "art", "jpg")).toBe("art.suruga.jpg");
      expect(narutoFaceFilename("carddas", "art", "gif")).toBe("art.carddas.gif");
    });
  });
}

// —— narutoCardPath ——
{
  describe("narutoDiskCardId", () => {
    it("keeps NI and N on distinct disk ids", () => {
      expect(narutoDiskCardId("ni001")).toBe("ni0001");
      expect(narutoDiskCardId("n001")).toBe("n0001");
      expect(narutoDiskCardId("忍-1")).toBe("ni0001");
      expect(narutoDiskCardId("n1650")).toBe("n1650");
      expect(narutoDiskCardId("te030-cdf")).toBe("te0030-cdf");
      expect(narutoDiskCardId("ST-226")).toBe("ta0226");
      expect(narutoDiskCardId("N-US097")).toBe("nus0097");
      expect(narutoDiskCardId("n0097-us")).toBe("nus0097");
    });
  });

  describe("narutoCardPath", () => {
    it("nests languages under the printed id, not the series", () => {
      expect(narutoCardRelPath(narutoCardPathFromCollector("ni001", "fr")!)).toBe(
        "ninja/ni0001/fr",
      );
      expect(narutoCardRelPath(narutoCardPathFromCollector("n001", "en")!)).toBe(
        "ninja/n0001/en",
      );
      expect(narutoCardRelPath(narutoCardPathFromCollector("n1650", "fr")!)).toBe(
        "ninja/n1650/fr",
      );
      expect(
        narutoCardRelPath(narutoCardPathFromCollector("N-US097", "en")!),
      ).toBe("ninja/nus0097/en");
      expect(normalizeNarutoLang("jap")).toBe("ja");
    });

    it("builds /assets URLs on the new tree", () => {
      expect(
        narutoAssetsCardUrl(
          "naruto/carddass",
          narutoCardPathFromCollector("ni001", "fr")!,
          "art.jpg",
        ),
      ).toBe("/assets/naruto/carddass/cards/ninja/ni0001/fr/art.jpg");
    });

    it("files 幕 / 忍者学校 under their own prefix folders", () => {
      expect(
        narutoCardRelPath(narutoCardPathFromCollector("gaku0001", "ja")!),
      ).toBe("gaku/gaku0001/ja");
      expect(
        narutoCardRelPath(narutoCardPathFromCollector("shi0001", "ja")!),
      ).toBe("shi/shi0001/ja");
      expect(
        narutoCardRelPath(narutoCardPathFromCollector("mju0062", "ja")!),
      ).toBe("mju/mju0062/ja");
      expect(
        narutoCardRelPath(narutoCardPathFromCollector("msa0044", "ja")!),
      ).toBe("msa/msa0044/ja");
    });
  });

  describe("print keys", () => {
    it("mints prefix keys and keeps NI distinct from N", () => {
      expect(mintNarutoPrintKey("ni001")).toBe("naruto:ni-0001");
      expect(mintNarutoPrintKey("n001")).toBe("naruto:n-0001");
      expect(mintNarutoPrintKey("ta081")).toBe("naruto:ta-0081");
      expect(mintNarutoPrintKey("m081")).toBe("naruto:m-0081");
      expect(mintNarutoPrintKey("te030-cdf")).toBe("naruto:te-0030-cdf");
      expect(mintNarutoPrintKey("ni023", "promo")).toBe("naruto:ni-0023-promo");
      expect(mintNarutoPrintKey("pr011", "promo")).toBe("naruto:pr-0011");
      expect(mintNarutoPrintKey("PR-忍-1", "promo")).toBe("naruto:prni-0001");
      expect(
        narutoCardRelPath(narutoCardPathFromCollector("PR-忍-1", "ja")!),
      ).toBe("promo/prni0001/ja");
      expect(mintNarutoPrintKey("N-US097")).toBe("naruto:nus-0097");
      expect(canonicalizeNarutoPrintKey("naruto:n-0097-us")).toBe(
        "naruto:nus-0097",
      );
    });

    it("rewrites series-baked keys without collapsing NI onto N", () => {
      expect(canonicalizeNarutoPrintKey("naruto:s1-ni001")).toBe(
        "naruto:ni-0001",
      );
      expect(canonicalizeNarutoPrintKey("naruto:s1-n001")).toBe("naruto:n-0001");
      expect(canonicalizeNarutoPrintKey("naruto:s28-n1650")).toBe(
        "naruto:n-1650",
      );
      expect(canonicalizeNarutoPrintKey("naruto:ni-0001")).toBe("naruto:ni-0001");
      expect(canonicalizeNarutoPrintKey("naruto:ni-001")).toBe("naruto:ni-0001");
      expect(canonicalizeNarutoPrintKey("naruto:ni-086")).toBe("naruto:ni-0086");
      expect(canonicalizeNarutoPrintKey("naruto:promo-ni023")).toBe(
        "naruto:ni-0023-promo",
      );
      expect(canonicalizeNarutoPrintKey("naruto:promo-te030-cdf")).toBe(
        "naruto:te-0030-cdf",
      );
    });
  });

  describe("voisinage ≠ identité", () => {
    it("does not treat NI-001 as N-001", () => {
      expect(narutoCollectorsMatch("ni001", "n001")).toBe(false);
      expect(narutoCollectorsMatch("NI-001", "忍-1")).toBe(true);
      expect(narutoCollectorsMatch("ta081", "M-081")).toBe(false);
      expect(narutoCollectorsMatch("ST-226", "ta226")).toBe(true);
      expect(narutoCollectorsMatch("JU-1002", "j1002")).toBe(true);
    });
  });

  /*
    188 tirages du catalogue n'ont **aucun** titre — donc aucune langue. Le
    paramètre était typé `string` et recevait `null` : le `.trim()` jetait, et
    comme la recherche de tirages enveloppe chaque provider dans un `allSettled`,
    une seule de ces cartes vidait **tout** le résultat.

    Concrètement : la modale d'ajout ne trouvait rien pour « cl04 », parce que la
    requête croisait `cl-0043`, qui n'a pas de titre — alors que `cl-0004` existe
    et que le catalogue admin l'affichait très bien.
  */
  describe("une carte sans langue ne fait pas tomber la recherche", () => {
    it("normalise une langue absente en chaîne vide, sans jeter", () => {
      expect(normalizeNarutoLang(null as unknown as string)).toBe("");
      expect(normalizeNarutoLang(undefined as unknown as string)).toBe("");
      expect(normalizeNarutoLang("  ")).toBe("");
    });

    it("garde la normalisation des langues réelles", () => {
      expect(normalizeNarutoLang("JAP")).toBe("ja");
      expect(normalizeNarutoLang("jp")).toBe("ja");
      expect(normalizeNarutoLang(" FR ")).toBe("fr");
    });

    /*
      Sans langue il n'y a pas de chemin : elle en est un segment
      (`client/cl0043/fr`). On rend `null` — l'appelant n'attache alors ni art ni
      vignette, et la carte reste sélectionnable par sa seule référence.
    */
    it("rend null plutôt qu'un chemin sans dossier de langue", () => {
      expect(
        narutoCardPathFromCollector("cl0043", null as unknown as string),
      ).toBeNull();
      expect(narutoCardPathFromCollector("cl0043", "")).toBeNull();
    });

    it("rend toujours le chemin quand la langue est là", () => {
      expect(narutoCardPathFromCollector("cl0043", "fr")).toMatchObject({
        diskId: "cl0043",
        lang: "fr",
      });
    });
  });
}

// —— narutoFaceBytes ——
{
  const dirs: string[] = [];

  function tmp(): string {
    const dir = path.join(
      os.tmpdir(),
      `naruto-face-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function jpeg(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 40, g: 80, b: 20 },
      },
    })
      .jpeg()
      .toBuffer();
  }

  describe("saveNarutoFace", () => {
    it("writes art.<source> beside an unsourced art.jpg", async () => {
      const cardDir = tmp();
      writeFileSync(path.join(cardDir, "art.jpg"), await jpeg(10, 14));
      const result = await saveNarutoFace({
        cardDir,
        buf: await jpeg(80, 112),
        source: "suruga",
        lang: "ja",
      });
      expect(result).toBe("ok");
      expect(existsSync(path.join(cardDir, "art.jpg"))).toBe(true);
      expect(existsSync(path.join(cardDir, "art.suruga.jpg"))).toBe(true);
      expect(existingNarutoArtForSource(cardDir, "suruga")).toBe(
        "art.suruga.jpg",
      );
      expect(existingNarutoArtForSource(cardDir, "legacy")).toBe("art.jpg");
      const decision = JSON.parse(
        readFileSync(path.join(cardDir, NARUTO_FACE_DECISION_FILE), "utf8"),
      ) as { art?: string };
      expect(decision.art).toBe("art.suruga.jpg");
    });

    it("skips only when that source is already on disk", async () => {
      const cardDir = tmp();
      writeNarutoArtFile(cardDir, await jpeg(20, 28), "suruga");
      const result = await saveNarutoFace({
        cardDir,
        buf: await jpeg(90, 126),
        source: "suruga",
        lang: "ja",
      });
      expect(result).toBe("skip");
      const nikita = await saveNarutoFace({
        cardDir,
        buf: await jpeg(30, 42),
        source: "nikita",
        lang: "ja",
      });
      expect(nikita).toBe("ok");
      expect(existsSync(path.join(cardDir, "art.suruga.jpg"))).toBe(true);
      expect(existsSync(path.join(cardDir, "art.nikita.jpg"))).toBe(true);
    });

    it("keeps reconstructed above a larger dump", async () => {
      const cardDir = tmp();
      writeFileSync(
        path.join(cardDir, "art.reconstructed.png"),
        await jpeg(20, 28),
      );
      await saveNarutoFace({
        cardDir,
        buf: await jpeg(200, 280),
        source: "nikita",
        lang: "ja",
      });
      const decision = JSON.parse(
        readFileSync(path.join(cardDir, NARUTO_FACE_DECISION_FILE), "utf8"),
      ) as { art?: string };
      expect(decision.art).toBe("art.reconstructed.png");
    });

    it("keeps the official FR raw when Coleka is a larger photo", async () => {
      const cardDir = tmp();
      writeNarutoArtFile(cardDir, await jpeg(350, 496), "carddass");
      await saveNarutoFace({
        cardDir,
        buf: await jpeg(900, 1200),
        source: "coleka",
        lang: "fr",
      });
      const decision = JSON.parse(
        readFileSync(path.join(cardDir, NARUTO_FACE_DECISION_FILE), "utf8"),
      ) as { art?: string };
      expect(decision.art).toBe("art.carddass.jpg");
    });
  });
}

// —— marketplacePadding ——
{
  async function makePadded(): Promise<Buffer> {
    const { default: sharp } = await import("sharp");
    // Le composite Mercari Shops : photo centrée sur fond menthe uniforme.
    return sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 188, g: 208, b: 196 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 200,
              height: 280,
              channels: 3,
              background: { r: 40, g: 90, b: 160 },
            },
          },
          left: 100,
          top: 60,
        },
      ])
      .jpeg()
      .toBuffer();
  }

  async function makeFullFrameCard(): Promise<Buffer> {
    const { default: sharp } = await import("sharp");
    // Un scan qui remplit le cadre, bords compris (même verdâtre).
    const noise = Buffer.alloc(400 * 560 * 3);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 7) % 256;
    return sharp(noise, {
      raw: { width: 400, height: 560, channels: 3 },
    })
      .jpeg()
      .toBuffer();
  }

  describe("isMarketplacePaddedImage", () => {
    it("flags the mint marketing composite, not a full-frame scan", async () => {
      expect(await isMarketplacePaddedImage(await makePadded())).toBe(true);
      expect(await isMarketplacePaddedImage(await makeFullFrameCard())).toBe(
        false,
      );
    });
  });
}

// —— carddasVol1Face ——
{
  describe("carddasJpVol1FaceStem", () => {
    it.each([
      ["忍-3", "shinobi-003_1"],
      ["術-15", "jutsu-015_1"],
      ["作-10", "saku-010_1"],
      ["依-43", "irai-043_1"],
      ["PR忍-1", null],
    ] as const)("maps %s", (printed, stem) => {
      expect(carddasJpVol1FaceStem(printed)).toBe(stem);
    });
  });

  describe("carddasJpVolumeFaceStem", () => {
    it.each([
      ["忍-146", 7, "shinobi-146_7"],
      ["術-348", 17, "jutsu-348_17"],
      ["作-332", 17, "saku-332_17"],
    ] as const)("maps %s vol %s", (printed, volume, stem) => {
      expect(carddasJpVolumeFaceStem(printed, volume)).toBe(stem);
    });
  });

  describe("carddasJpVol1FaceOriginalUrls", () => {
    it("prefers cardlist/card_img on carddas.com", () => {
      expect(carddasJpVol1FaceOriginalUrls("shinobi-003_1")[0]).toBe(
        "http://www.carddas.com/naruto/cardlist/card_img/shinobi-003_1.gif",
      );
    });

    it("builds Wayback image URLs", () => {
      expect(
        waybackImageUrl(
          "20071224051112",
          "http://www.carddas.com/naruto/cardlist/card_img/shinobi-003_1.gif",
        ),
      ).toBe(
        "https://web.archive.org/web/20071224051112im_/http://www.carddas.com/naruto/cardlist/card_img/shinobi-003_1.gif",
      );
    });
  });

  describe("carddasJpVol1FaceTargets", () => {
    it("lists 70 maki1 stems including ni0003", () => {
      const targets = carddasJpVol1FaceTargets();
      expect(targets).toHaveLength(70);
      expect(targets.find((t) => t.number === "ni0003")).toMatchObject({
        printed: "忍-3",
        stem: "shinobi-003_1",
      });
    });
  });
}

