import { describe, expect, it, afterEach, vi } from "vitest";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import coleka from "../curated/sources/coleka.json";
import { narutoDiskCardId } from "../identity";
import { planTvTokyoFaceSources } from "../install/faces";
import { mercariIngestFaces, mercariLedger, yahooAuctionLedger, yahooIngestFaces, slabzFaceLedger, slabzFaceUrl, slabzIngestFaces, tvTokyoFaceSourceFromFile, bandaiFrSerie1DetailleeHoloCount, bandaiFrSerie1DetailleeLedger, bandaiFrSerie1DetailleePrintKeys } from "./faces";
import { rakutenFaceLedger, rakutenIngestFaces, rakutenIngestPackshots, bandaiFrUsDriveIngestPackshots, bandaiFrUsDriveLedger, bandaiFrUsDriveNewEnDisplays, colekaCarddassFrBranchCoverUrl, colekaEnCcgCoverLedger, colekaEnCcgNewDisplays, colekaThumbToFull } from "./packshots";

vi.mock("@/lib/http/scrapeFetch", () => ({
  fetchTextWithFlareFallback: vi.fn(),
  fetchGetWithFlareFallback: vi.fn(),
}));

// —— mercari ——
{
  describe("mercari 忍-3 leads", () => {
    it("does not crawl live search", () => {
      expect(mercariLedger().crawlLive).toBe(false);
      expect(mercariLedger().ingest).toBe("curated-faces");
      expect(mercariLedger().not).toContain("opni-as-ni0003");
    });

    it("ingests 巻ノ壱 忍-3 and rejects pasted OP忍-3 titles", () => {
      expect(mercariIngestFaces().map((row) => row.printedRef)).toEqual([
        "忍-3",
        "忍-20",
        "忍-1（PS）",
        "忍-2（PS）",
        "忍-3（PS）",
        "忍-11（PS）",
        "忍-332",
        "忍-309",
        "PR作-11",
        "忍-349",
        "CAN-2",
        "CAN-5",
        "忍-338",
        "忍-363",
        "忍-370",
        "忍-379",
        "COIN-11",
        "PR忍-19",
        "CAN-1",
        "OP忍-5",
        "忍-276",
        "作-253",
        "PR忍-7",
        "忍-281",
        "忍-282",
        "忍-283",
        "忍-371",
        "忍-415",
        "忍-369",
        "作-299",
        "術-356",
        "忍-356",
        "術-345",
        "術-329",
        "術-325",
        "術-327",
        "術-319",
        "術-310",
        "術-252",
        "忍-415",
        "忍-403",
        "忍-371",
        "作-310",
        "作-316",
      ]);
      expect(mercariIngestFaces()[0]?.listing).toBe(
        "https://jp.mercari.com/item/m63902869042",
      );
      expect(mercariIngestFaces()[0]?.bandaiYear).toBe(2002);
      expect(narutoDiskCardId("忍-3")).toBe("ni0003");
      const rejected = mercariLedger().faces.filter(
        (row) => row.ingest === false,
      );
      // The OP忍-3 rejects are an *identity* call: a 2005 promo wearing the same
      // name. They must stay rejected whatever else lands in the ledger.
      const opRejects = rejected.filter((row) => row.printedRef === "OP忍-3");
      expect(opRejects.map((row) => row.listing)).toEqual([
        "https://www.cafr.ebay.ca/itm/185397519690",
        "https://www.ebay.com/itm/235949420497",
        "https://jp.mercari.com/item/m90117035741",
        "https://jp.mercari.com/item/m54760516214",
        "https://item.fril.jp/fe3228355049173d7f63cc04e45260ed",
        "https://www.ebay.com/itm/175873810783",
        "https://www.ebay.com/itm/196448894281",
      ]);
      expect(opRejects).toHaveLength(7);
    });

    it("keeps the （PS） pre-order cards off their booster numbers", () => {
      const ps = mercariIngestFaces().filter((row) =>
        row.printedRef.endsWith("（PS）"),
      );
      expect(ps).toHaveLength(4);
      // Same numbers as booster cards, different cards: 書き下ろし art, NOT FOR SALE.
      expect(ps.map((row) => narutoDiskCardId(row.printedRef))).toEqual([
        "ni0001-ps",
        "ni0002-ps",
        "ni0003-ps",
        "ni0011-ps",
      ]);
      expect(narutoDiskCardId("忍-1")).toBe("ni0001");
      expect(ps.every((row) => row.bandaiYear === 2003)).toBe(true);
      /*
        One listing, one photo each — the lot shows every card separately.
        Les photos vivent sur mercdn (plus de copie `curated` en git depuis le
        2026-09 : la provenance est ce ledger + reconstructed-provenance.json).
      */
      expect(new Set(ps.map((row) => row.listing)).size).toBe(1);
      expect(new Set(ps.map((row) => row.url)).size).toBe(4);
    });

    it("ingests the 巻ノ十四 忍-332 orphan lead", () => {
      const row = mercariIngestFaces().find(
        (face) => face.printedRef === "忍-332",
      );
      expect(row).toMatchObject({ setCode: "maki14", lang: "ja" });
      expect(row?.bandaiYear).toBe(2005);
      expect(narutoDiskCardId("忍-332")).toBe("ni0332");
    });

    it("keeps one 忍-20 photo and says why the others lost", () => {
      const twenty = mercariLedger().faces.filter(
        (row) => row.printedRef === "忍-20",
      );
      // Same card, three photos: only the straight-on unsleeved one is a face.
      expect(twenty.filter((row) => row.ingest === true)).toHaveLength(1);
      expect(twenty.filter((row) => row.ingest === false)).toHaveLength(2);
      expect(
        twenty.every((row) =>
          row.ingest === false ? Boolean(row.reason) : true,
        ),
      ).toBe(true);
      expect(narutoDiskCardId("忍-20")).toBe("ni0020");
    });
  });
}

// —— yahooAuctions ——
{
  describe("yahoo auction faces", () => {
    it("does not crawl live search", () => {
      expect(yahooAuctionLedger().crawlLive).toBe(false);
      expect(yahooAuctionLedger().ingest).toBe("curated-faces");
    });

    it("ingests attested 巻ノ壱 + OP/PR photos, not 忍-3 stand-ins", () => {
      expect(yahooIngestFaces().map((row) => row.printedRef)).toEqual([
        "忍-19",
        "忍-20",
        "術-14",
        "術-17",
        "作-5",
        "作-8",
        "作-14",
        "作-18",
        "作-21",
        "OP忍-3",
        "PR忍-3",
        "PR作-11",
        "PR作-12",
        "PR作-29",
        "CAN-3",
        "CAN-4",
        "CAN-5",
        "CAN-6",
        "PR作-26",
        "CAN-1",
        "忍-399",
        "忍-405",
        "忍-410",
        "忍-406",
        "作-330",
        "作-333",
        "作-335",
        "PR忍-4",
        "忍-1",
        "PR忍-8",
        "忍-331",
        "忍-397",
        "忍-413",
        "忍-416",
        "PR忍-14",
        "PR忍-18",
        "術-319",
        "術-355",
        "術-359",
        "術-350",
      ]);
      expect(
        yahooIngestFaces().every((row) => row.curated.endsWith("source.jpg")),
      ).toBe(true);
      expect(
        yahooIngestFaces().map((row) => narutoDiskCardId(row.printedRef)),
      ).toEqual([
        "ni0019",
        "ni0020",
        "te0014",
        "te0017",
        "ta0005",
        "ta0008",
        "ta0014",
        "ta0018",
        "ta0021",
        "opni0003",
        "prni0003",
        "prta0011",
        "prta0012",
        "prta0029",
        "can0003",
        "can0004",
        "can0005",
        "can0006",
        "prta0026",
        "can0001",
        "ni0399",
        "ni0405",
        "ni0410",
        "ni0406",
        "ta0330",
        "ta0333",
        "ta0335",
        "prni0004",
        "ni0001",
        "prni0008",
        "ni0331",
        "ni0397",
        "ni0413",
        "ni0416",
        "prni0014",
        "prni0018",
        "te0319",
        "te0355",
        "te0359",
        "te0350",
      ]);
      expect(
        yahooAuctionLedger().faces.some(
          (row) => row.printedRef === "忍-3" && row.ingest === false,
        ),
      ).toBe(true);
      expect(yahooIngestFaces().some((row) => row.printedRef === "忍-3")).toBe(
        false,
      );
      // Seller title PR忍-1 ≠ printed 忍-1 (巻ノ壱). Suruga path ≠ PR忍-1-R.
      expect(
        yahooAuctionLedger().faces.some(
          (row) => row.printedRef === "PR忍-1" && row.ingest === false,
        ),
      ).toBe(true);
      expect(
        yahooAuctionLedger().faces.some(
          (row) => row.printedRef === "PR忍-1-R" && row.ingest === false,
        ),
      ).toBe(true);
      expect(
        yahooIngestFaces().find((row) => row.printedRef === "忍-1")?.listing,
      ).toBe("https://paypayfleamarket.yahoo.co.jp/item/z680858402");
      expect(
        yahooIngestFaces().filter((row) =>
          (row.listing ?? "").includes("z647535466"),
        ).map((row) => row.printedRef),
      ).toEqual([
        "忍-399",
        "忍-405",
        "忍-410",
        "忍-406",
        "作-330",
        "作-333",
        "作-335",
        "術-355",
        "術-359",
      ]);
    });
  });
}

// —— slabzFaces ——
{
  describe("slabz faces ledger", () => {
    it("keeps five pasted media ids recoverable via Wix CDN — no blog crawl", () => {
      const ledger = slabzFaceLedger();
      expect(ledger.faces.ingest).toBe("art.slabz.jpg");
      expect(ledger.faces.note).toMatch(/pas de crawl|collées/i);
      const faces = slabzIngestFaces();
      expect(faces).toHaveLength(5);
      expect(faces.map((f) => f.disk)).toEqual([
        "ni0001",
        "ni0002",
        "ni0003",
        "ni0011",
        "prni0001",
      ]);
      for (const row of faces) {
        expect(row.media).toMatch(/^2bc309_[a-f0-9]{32}$/);
        expect(slabzFaceUrl(row.media)).toBe(
          `https://static.wixstatic.com/media/${row.media}~mv2.jpg`,
        );
      }
    });
  });
}

// —— tvTokyoFaces ——
{
  describe("tvTokyoFaceSourceFromFile", () => {
    it("maps a/b suffixes to parallel dumps", () => {
      expect(tvTokyoFaceSourceFromFile("s193a.jpg")).toBe("tvtokyo-a");
      expect(tvTokyoFaceSourceFromFile("s193b.jpg")).toBe("tvtokyo-b");
      expect(tvTokyoFaceSourceFromFile("s178.jpg")).toBe("tvtokyo");
      expect(tvTokyoFaceSourceFromFile("s178b.jpg")).toBe("tvtokyo-b");
      expect(tvTokyoFaceSourceFromFile("n01.jpg")).toBe("tvtokyo");
    });
  });

  describe("planTvTokyoFaceSources", () => {
    it("keeps both sides of every double diskId", () => {
      const { planned, failed } = planTvTokyoFaceSources();
      expect(failed).toEqual([]);
      expect(planned.length).toBe(829);

      const byDisk = new Map<string, string[]>();
      for (const row of planned) {
        const list = byDisk.get(row.diskId) ?? [];
        list.push(row.source);
        byDisk.set(row.diskId, list);
      }
      expect(byDisk.get("ta0193")?.sort()).toEqual(["tvtokyo-a", "tvtokyo-b"]);
      expect(byDisk.get("ta0178")?.sort()).toEqual(["tvtokyo", "tvtokyo-b"]);
      expect(byDisk.get("ta0034")?.sort()).toEqual(["tvtokyo", "tvtokyo-b"]);
      expect(byDisk.size).toBe(790);
    });
  });
}

// —— rakutenFaces ——
{
  describe("rakuten faces ledger", () => {
    it("keeps pasted CDN faces recoverable — no store crawl", () => {
      const ledger = rakutenFaceLedger();
      expect(ledger.note).toMatch(/do not crawl|paste/i);
      expect(ledger.source).toBe("rakuten");
      const faces = rakutenIngestFaces();
      expect(faces.length).toBeGreaterThan(50);
      for (const row of faces) {
        expect(row.ingest).toBe(true);
        expect(row.url).toMatch(/^https:\/\/fr\.shopping\.rakuten\.com\/pictures\//);
        expect(row.url).toMatch(/_NOPAD\.jpg$/i);
        const disk =
          String(row.diskId ?? "").trim() ||
          narutoDiskCardId(String(row.printedRef ?? ""));
        expect(disk).toBeTruthy();
        expect(String(row.lang ?? "fr").toLowerCase()).toBe("fr");
      }
    });

    it("does not treat tin-box packshots as card faces", () => {
      expect(rakutenIngestPackshots()).toEqual([]);
    });

    it("resolves TA-225 from the ledger like the pasted Angle mort scan", () => {
      const row = rakutenIngestFaces().find((f) => f.diskId === "ta0225");
      expect(row?.printedRef).toMatch(/TA-225/i);
      expect(row?.url).toContain("0199da0e-e3d3-7168-a73c-bc47848b1a8b");
    });
  });
}

// —— bandaiFrUsDrive ——
{
  describe("bandaiFrUsDrive", () => {
    it("points at the Bandai FR/US hub and stages Kayou/Panini outside Carddass", () => {
      const ledger = bandaiFrUsDriveLedger();
      expect(ledger.hub.folderId).toBe("1V1bqHi6SpJznGids8-o8Y9vQ2gb8aV07");
      expect(ledger.branches.fr.docs.length).toBe(2);
      expect(ledger.branches.us.folders.Decks.empty).toBe(true);
      expect(ledger.branches.us.folders["Tin box"].empty).toBe(true);
      expect(ledger.relatedOutsideHub.kayou.not).toContain("carddass");
      expect(ledger.relatedOutsideHub.paniniNinjaRanks.not).toContain("carddass");
      expect(ledger.not).toContain("mint-display-s1-s6");
    });

    it("ingests only EN SKUs that do not collide with Carddass FR displays s1–s6", () => {
      const rows = bandaiFrUsDriveIngestPackshots();
      expect(rows.length).toBeGreaterThanOrEqual(20);
      expect(
        rows.every((row) =>
          String(row.staging).startsWith("staging/bandai-fr-us-drive/"),
        ),
      ).toBe(true);
      expect(
        rows.some(
          (row) =>
            row.slug === "display-s1" ||
            row.slug === "display-s2" ||
            row.slug === "booster-s1",
        ),
      ).toBe(false);
      expect(rows.some((row) => row.slug === "booster-s5-en")).toBe(true);
      expect(rows.some((row) => row.slug === "display-s13")).toBe(true);
    });

    it("mints EN display SKUs for s7–s12 from Drive packshots", () => {
      const sets = bandaiFrUsDriveNewEnDisplays().map((row) => row.set);
      expect(sets).toEqual(["s7", "s8", "s9", "s10", "s11", "s12"]);
    });
  });
}

// —— bandaiFrSerie1Detaillee ——
{
  describe("bandaiFrSerie1Detaillee", () => {
    it("matches the printed Carddass FR S1 checklist (184) and marketing holos (33)", () => {
      const ledger = bandaiFrSerie1DetailleeLedger();
      expect(ledger.marketing.collectorTotal).toBe(188);
      expect(ledger.marketing.holos).toBe(33);
      expect(ledger.cardCount).toBe(188);
      expect(bandaiFrSerie1DetailleeHoloCount()).toBe(33);

      const keys = bandaiFrSerie1DetailleePrintKeys();
      expect(keys).toHaveLength(184);

      const checklistPath = path.join(
        process.cwd(),
        "src/providers/naruto/narutocarddass/curated/sources/carddass-fr-checklist.json",
      );
      const checklist = JSON.parse(readFileSync(checklistPath, "utf8")) as {
        sets: { s1: { ids: string[] } };
      };
      expect([...checklist.sets.s1.ids].sort()).toEqual(keys);
    });
  });
}

// —— colekaListingFetch ——
{
  const { fetchTextWithFlareFallback } = await import("@/lib/http/scrapeFetch");
  const { fetchColekaListingHtml } = await import(
    "@/providers/shared/coleka/listingFetch"
  );

  const WALL = "<title>Vérification</title><p>/verify/?lang=fr</p>";
  const LISTING = `<html>${"x".repeat(500)}<a class="lib_has_2_lines">ok</a></html>`;

  describe("fetchColekaListingHtml", () => {
    afterEach(() => {
      vi.mocked(fetchTextWithFlareFallback).mockReset();
    });

    it("refetches a cached verify wall instead of treating it as a stop", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "coleka-listing-"));
      const dest = path.join(dir, "s1-listing-1.html");
      mkdirSync(dir, { recursive: true });
      writeFileSync(dest, WALL, "utf8");
      vi.mocked(fetchTextWithFlareFallback).mockResolvedValue(LISTING);
      const html = await fetchColekaListingHtml(
        "https://www.coleka.com/x?p=1",
        dest,
        false,
      );
      expect(html).toContain("lib_has_2_lines");
      expect(fetchTextWithFlareFallback).toHaveBeenCalledOnce();
    });

    it("reuses a cached listing that is not a wall", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "coleka-listing-"));
      const dest = path.join(dir, "s1-listing-0.html");
      writeFileSync(dest, LISTING, "utf8");
      const html = await fetchColekaListingHtml(
        "https://www.coleka.com/x",
        dest,
        false,
      );
      expect(html).toBe(LISTING);
      expect(fetchTextWithFlareFallback).not.toHaveBeenCalled();
    });

    it("refetches a listing older than maxAgeMs", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "coleka-listing-"));
      const dest = path.join(dir, "s1-listing-old.html");
      writeFileSync(dest, LISTING, "utf8");
      const past = Date.now() - 2 * 60 * 60 * 1000;
      const { utimesSync } = await import("node:fs");
      utimesSync(dest, past / 1000, past / 1000);
      vi.mocked(fetchTextWithFlareFallback).mockResolvedValue(
        `<html>${"y".repeat(500)}<a class="lib_has_2_lines">fresh</a></html>`,
      );
      const html = await fetchColekaListingHtml(
        "https://www.coleka.com/x",
        dest,
        false,
        { maxAgeMs: 60 * 60 * 1000 },
      );
      expect(html).toContain("fresh");
      expect(fetchTextWithFlareFallback).toHaveBeenCalledOnce();
    });

    it("falls back to a good cached page when a refetch hits the verify wall", async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "coleka-listing-"));
      const dest = path.join(dir, "s1-listing-1.html");
      writeFileSync(dest, LISTING, "utf8");
      vi.mocked(fetchTextWithFlareFallback).mockResolvedValue(WALL);
      const html = await fetchColekaListingHtml(
        "https://www.coleka.com/x?p=1",
        dest,
        true,
      );
      expect(html).toBe(LISTING);
    });
  });
}

// —— colekaEnCcgCovers ——
{
  describe("coleka EN CCG covers", () => {
    it("turns Coleka size suffixes into the full rubrique webp", () => {
      expect(
        colekaThumbToFull(
          "https://thumbs.coleka.com/media/rubrique/202401/26/96f6jtlhy9888hjmetwn_300x300.webp",
        ),
      ).toBe(
        "https://thumbs.coleka.com/media/rubrique/202401/26/96f6jtlhy9888hjmetwn.webp",
      );
      expect(
        colekaThumbToFull(
          "https://thumbs.coleka.com/media/rubrique/201802/21/cartes-de-collection-naruto-cartes-a-jouer-et-a-collectionner-cartes-naruto-serie-01_120x120.webp",
        ),
      ).toBe(
        "https://thumbs.coleka.com/media/rubrique/201802/21/cartes-de-collection-naruto-cartes-a-jouer-et-a-collectionner-cartes-naruto-serie-01.webp",
      );
    });

    it("keeps Coleka's own Carddass FR branch name and 741 count", () => {
      expect(coleka.seriesFrancaises.title).toBe(
        "Naruto Carddass - Séries Françaises",
      );
      expect(coleka.seriesFrancaises.listedCount).toBe(741);
      expect(coleka.seriesFrancaises.scrape).toBe(false);
      expect(coleka.seriesFrancaises.rules.winGains).toBe(10);
      expect(coleka.seriesFrancaises.description).toContain("Naruto Carddass");
      expect(coleka.seriesFrancaises.description).toContain("10 gains");
      expect(coleka.seriesFrancaises.description).toContain("741 cartes");
      expect(coleka.branches["series-francaises"]).toContain("_r41705");
      expect(coleka.branches["serie-01"]).toContain("_r4108");
      expect(coleka.branches["serie-02"]).toContain("_r4109");
      expect(coleka.branches["serie-05"]).toContain("_r4112");
    });

    it("uses the full Carddass FR branch cover, not the 300×300 thumb", () => {
      const full =
        "https://thumbs.coleka.com/media/rubrique/202411/15/cartes-de-collection-cartes-anime-manga-naruto-cartes-a-jouer-et-a-collectionner-naruto-carddass-series-francaises.webp";
      expect(coleka.branches["series-francaises-cover"]).toBe(full);
      expect(colekaCarddassFrBranchCoverUrl()).toBe(full);
      expect(colekaCarddassFrBranchCoverUrl()).not.toContain("_300x300");
    });

    it("does not mint a second s28 SKU or ingest Kayou / Carddass FR", () => {
      const sets = colekaEnCcgNewDisplays().map((row) => row.set);
      expect(sets).toEqual([
        "s13",
        "s14",
        "s15",
        "s17",
        "s18",
        "s20",
        "s24",
        "s25",
        "s26",
      ]);
      expect(sets).not.toContain("s28");
      expect(sets.some((s) => Number(s.slice(1)) <= 6)).toBe(false);
      const ledger = colekaEnCcgCoverLedger();
      expect(ledger.skip.map((row) => row.kind)).toEqual([
        "kayou",
        "carddass-fr-branch",
      ]);
      expect(ledger.rampageTornado.scrape).toBe(true);
      expect(ledger.rampageTornado.setCode).toBe("tempete");
      expect(ledger.rampageTornado.url).toContain("_r16963");
      expect(ledger.rampageTornado.colekaCardCount).toBe(33);
      const hashed = ledger.covers.find((row) => row.set === "s26");
      expect(hashed?.title).toBe("Avenger's Wrath");
      expect(hashed?.thumb).toContain("96f6jtlhy9888hjmetwn");
      const s27 = ledger.seriesPages.find((row) => row.set === "s27");
      expect(s27?.printedLanguages).toEqual(["en"]);
      expect(s27?.colekaNote).toBe("sorti uniquement en anglais");
      expect(s27?.url).toContain("_r36959");
      expect(ledger.missingSeriesInPaste).toEqual([16, 19, 21, 22, 23]);
      expect(ledger.goatGapPackshots).toEqual([
        "s16",
        "s19",
        "s21",
        "s22",
        "s23",
        "s27",
      ]);
      expect(ledger.carddassFrSeriesIcons.map((row) => row.set)).toEqual([
        "s1",
        "s2",
        "s3",
        "s4",
        "s5",
      ]);
    });
  });
}

