/**
 * Tests — durableCdn + ingest ledger + anti-désync identity browse + printed.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { tryBuildIdentityCatalogueRows } from "@/lib/admin/catalogueIdentityBrowse";
import { cataloguePackInfo } from "@/lib/admin/cataloguePacks";
import {
  catalogArtefactIsFresh,
  hashCatalogArtefactBytes,
  readCatalogIngestLedger,
  recordCatalogPromoteAndPurgeStaging,
} from "@/providers/shared/catalogIngestLedger";
import {
  catalogAssetDurability,
  catalogUrlMayStayRemote,
  catalogUrlRequiresLocalConservation,
} from "@/providers/shared/catalogDurableCdn";
import { listTcgdexRowsForLanguage } from "@/providers/pokemon/tcgdex/indexStore";
import { listLorcanaTcgRowsForLanguage } from "@/providers/lorcana/lorcanatcg/indexStore";
import { listDbsCgRowsForLanguage } from "@/providers/dragonball/dbscg/indexStore";
import { listDbsFwRowsForLanguage } from "@/providers/dragonball/dbsfw/indexStore";
import {
  ensureNarutoPackIndex,
  loadNarutoCardsIndexFromSqlite,
  NARUTO_PACK_ID,
} from "@/providers/naruto/narutocarddass/indexStore";
import { enumerateNarutoSetPrints } from "@/providers/naruto/narutocarddass/catalogueBrowse";
import {
  listNarutoPrintSets,
  listNarutoSetPrints,
} from "@/providers/naruto/narutocarddass/search";
import { createLocalPrintsIndex } from "@/providers/shared/cardCatalogue/localPrintsIndex";
import { getProviderModule } from "@/core/catalog/catalog";

describe("catalogDurableCdn", () => {
  it("marks known encyclopaedia / static hosts as durable", () => {
    expect(catalogAssetDurability("https://assets.tcgdex.net/fr/swsh/swsh3/136")).toBe(
      "durable_cdn",
    );
    expect(
      catalogUrlMayStayRemote(
        "https://api.lorcana.ravensburger.com/images/example.webp",
      ),
    ).toBe(true);
    expect(catalogUrlMayStayRemote("https://static.pkmcards.fr/card.jpg")).toBe(
      true,
    );
    expect(
      catalogUrlMayStayRemote(
        "https://cards.scryfall.io/normal/front/0/0/0000419b-0bba-4488-8f7a-6194544ce91e.jpg",
      ),
    ).toBe(true);
  });

  it("requires local conservation for marketplace / unknown hosts", () => {
    expect(
      catalogUrlRequiresLocalConservation(
        "https://i.ebayimg.com/images/g/abc/s-l1600.jpg",
      ),
    ).toBe(true);
    expect(catalogAssetDurability("https://suruga-ya.com/foo.jpg")).toBe(
      "ephemeral",
    );
  });
});

describe("catalogIngestLedger", () => {
  const tmp = () =>
    path.join(
      os.tmpdir(),
      `placarr-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );

  it("records hash then purges staging; fresh hash skips re-fetch", () => {
    const root = tmp();
    mkdirSync(root, { recursive: true });
    const ledgerPath = path.join(root, "ingest-ledger.json");
    const stagingPath = path.join(root, "staging", "bundle.bin");
    mkdirSync(path.dirname(stagingPath), { recursive: true });
    const bytes = Buffer.from("catalogue-artefact-v1");
    writeFileSync(stagingPath, bytes);
    const contentHash = hashCatalogArtefactBytes(bytes);

    const ledger = recordCatalogPromoteAndPurgeStaging({
      ledgerPath,
      artefactId: "demo/bundle",
      contentHash,
      stagingPath,
    });

    expect(existsSync(stagingPath)).toBe(false);
    expect(catalogArtefactIsFresh(ledger, "demo/bundle", contentHash)).toBe(
      true,
    );
    expect(
      catalogArtefactIsFresh(ledger, "demo/bundle", "deadbeef"),
    ).toBe(false);
    expect(readCatalogIngestLedger(ledgerPath).entries["demo/bundle"]?.contentHash).toBe(
      contentHash,
    );
  });

  it("purges staging directories and keeps ledger durable", () => {
    const root = tmp();
    const ledgerPath = path.join(root, "logs", "catalog-ingest-ledger.json");
    const stagingDir = path.join(root, "staging", "hub");
    mkdirSync(stagingDir, { recursive: true });
    writeFileSync(path.join(stagingDir, "a.bin"), "x");
    recordCatalogPromoteAndPurgeStaging({
      ledgerPath,
      artefactId: "drive:demo",
      contentHash: "obs|folder",
      stagingPath: path.join(root, "staging"),
    });
    expect(existsSync(path.join(root, "staging"))).toBe(false);
    expect(existsSync(ledgerPath)).toBe(true);
    expect(
      catalogArtefactIsFresh(
        readCatalogIngestLedger(ledgerPath),
        "drive:demo",
        "obs|folder",
      ),
    ).toBe(true);
  });
});

describe("catalogue identity browse anti-désync", () => {
  it("Pokémon admin locales include JA + FR + EN", () => {
    expect(cataloguePackInfo("pokemon")?.catalogueLocales).toEqual([
      "ja",
      "fr",
      "en",
    ]);
    expect(cataloguePackInfo("pokemon")?.expandLocales).toBe(true);
  });

  it(
    "Pokémon admin ⊇ checklist; admin−checklist ⊆ printed=false",
    async () => {
      const checklistRows = listTcgdexRowsForLanguage("fr");
      if (checklistRows.length === 0) return; // no local corpus in CI sandbox

      const checklist = new Set(checklistRows.map((r) => r.printKey));
      const browse = tryBuildIdentityCatalogueRows("pokemon");
      expect(browse).not.toBeNull();
      const faces = (browse ?? []).filter(
        (r) => r.kind !== "pack-back" && r.lang === "fr",
      );
      expect(faces.length).toBeGreaterThan(0);

      const adminAll = new Set(faces.map((r) => r.printKey));
      for (const key of [...checklist].slice(0, 80)) {
        expect(adminAll.has(key)).toBe(true);
      }

      const adminPrinted = new Set(
        faces.filter((r) => r.printed !== false).map((r) => r.printKey),
      );
      for (const key of [...checklist].slice(0, 80)) {
        expect(adminPrinted.has(key)).toBe(true);
      }

      for (const row of faces) {
        if (checklist.has(row.printKey)) continue;
        expect(row.printed).toBe(false);
      }

      const mod = getProviderModule("tcgdex");
      if (mod?.listSetPrints) {
        const setId = checklistRows[0]!.setId;
        const listed = await mod.listSetPrints({
          setId,
          language: "fr",
          includeUnprinted: false,
        });
        expect(listed.every((c) => c.printed !== false)).toBe(true);
      }
    },
    60_000,
  );

  it("Lorcana identity browse printKeys ⊆ checklist sqlite (same corpus)", () => {
    const checklist = new Set(
      listLorcanaTcgRowsForLanguage("en").map((r) => r.printKey),
    );
    if (checklist.size === 0) return;

    const browse = tryBuildIdentityCatalogueRows("lorcana");
    expect(browse).not.toBeNull();
    const faces = (browse ?? []).filter((r) => r.lang === "en");
    expect(faces.length).toBeGreaterThan(0);
    for (const row of faces.slice(0, 50)) {
      expect(checklist.has(row.printKey)).toBe(true);
    }
  });

  it("DBS Masters identity browse printKeys ⊆ checklist sqlite", () => {
    const checklist = new Set(
      listDbsCgRowsForLanguage("fr").map((r) => r.printKey),
    );
    if (checklist.size === 0) return;

    const browse = tryBuildIdentityCatalogueRows("dragonball/cg");
    expect(browse).not.toBeNull();
    const faces = (browse ?? []).filter((r) => r.lang === "fr");
    expect(faces.length).toBeGreaterThan(0);
    for (const row of faces.slice(0, 50)) {
      expect(checklist.has(row.printKey)).toBe(true);
    }
  });

  it("DBS Fusion World identity browse printKeys ⊆ checklist sqlite", () => {
    const checklist = new Set(
      listDbsFwRowsForLanguage("en").map((r) => r.printKey),
    );
    if (checklist.size === 0) return;

    const browse = tryBuildIdentityCatalogueRows("dragonball/fw");
    expect(browse).not.toBeNull();
    const faces = (browse ?? []).filter((r) => r.lang === "en");
    expect(faces.length).toBeGreaterThan(0);
    for (const row of faces.slice(0, 50)) {
      expect(checklist.has(row.printKey)).toBe(true);
    }
  });

  it.each([
    { pack: "onepiece" as const, lang: "en" },
    { pack: "yugioh" as const, lang: "en" },
    { pack: "mtg" as const, lang: "en" },
    { pack: "naruto/kayou" as const, lang: "en" },
  ])(
    "$pack identity browse printKeys ⊆ checklist sqlite (same corpus)",
    ({ pack, lang }) => {
      const index = createLocalPrintsIndex(pack);
      if (!index.hasIdentityCorpus()) return;

      const checklist = new Set(
        index.listRowsForLanguage(lang).map((r) => r.printKey),
      );
      if (checklist.size === 0) return;

      const browse = tryBuildIdentityCatalogueRows(pack);
      expect(browse).not.toBeNull();
      const faces = (browse ?? []).filter(
        (r) => r.kind !== "pack-back" && r.lang === lang,
      );
      expect(faces.length).toBeGreaterThan(0);
      for (const row of faces.slice(0, 50)) {
        expect(checklist.has(row.printKey)).toBe(true);
      }
      expect(faces.every((r) => r.printKey.includes(":"))).toBe(true);
    },
  );

  it(
    "Carddass identity browse is non-null when catalog.sqlite exists",
    () => {
      const db = ensureNarutoPackIndex(NARUTO_PACK_ID);
      if (!db) return; // no local corpus in CI sandbox

      const browse = tryBuildIdentityCatalogueRows("naruto/carddass");
      expect(browse).not.toBeNull();
      expect((browse ?? []).length).toBeGreaterThan(0);
      expect(browse!.every((r) => r.printKey.includes(":"))).toBe(true);
    },
    120_000,
  );

  it(
    "Carddass admin browse printKeys ⊆ catalog.sqlite (same corpus)",
    () => {
      const index = loadNarutoCardsIndexFromSqlite(NARUTO_PACK_ID);
      if (!index || Object.keys(index.cards).length === 0) return;

      const checklist = new Set(Object.keys(index.cards));
      const browse = tryBuildIdentityCatalogueRows("naruto/carddass");
      expect(browse).not.toBeNull();
      const faces = (browse ?? []).filter((r) => r.kind !== "pack-back");
      expect(faces.length).toBeGreaterThan(0);
      for (const row of faces.slice(0, 80)) {
        expect(checklist.has(row.printKey)).toBe(true);
      }
    },
    120_000,
  );

  it(
    "Carddass checklist ⊆ admin enum; admin−checklist ⊆ printed=false (FR)",
    () => {
      const db = ensureNarutoPackIndex(NARUTO_PACK_ID);
      if (!db) return;

      const checklistKeys = new Set<string>();
      for (const set of listNarutoPrintSets("fr")) {
        for (const row of listNarutoSetPrints({
          setId: set.id,
          language: "fr",
          includeUnprinted: false,
        })) {
          checklistKeys.add(row.printKey);
        }
      }
      if (checklistKeys.size === 0) return;

      const adminFaces = enumerateNarutoSetPrints({
        includeUnprinted: true,
      }).filter((r) => r.lang.toLowerCase() === "fr");
      const adminAll = new Map(
        adminFaces.map((r) => [r.printKey, r] as const),
      );

      for (const key of checklistKeys) {
        expect(adminAll.has(key), key).toBe(true);
      }

      const adminPrinted = new Set(
        adminFaces
          .filter((r) => r.printed !== false)
          .map((r) => r.printKey),
      );
      for (const key of checklistKeys) {
        expect(adminPrinted.has(key), key).toBe(true);
      }

      for (const [key, row] of adminAll) {
        if (checklistKeys.has(key)) continue;
        expect(row.printed, key).toBe(false);
      }
    },
    120_000,
  );

  it("TCG packs do not require cards-index.json as emptyUnless / extractMarkers", () => {
    const tcgPacks = [
      "pokemon",
      "lorcana",
      "naruto/carddass",
      "naruto/kayou",
      "onepiece",
      "yugioh",
      "mtg",
      "dragonball/cg",
      "dragonball/fw",
    ] as const;
    for (const id of tcgPacks) {
      const pack = cataloguePackInfo(id);
      if (!pack) continue;
      expect(pack.emptyUnless, id).not.toContain("cards-index.json");
      expect(pack.extractMarkers, id).not.toContain("cards-index.json");
      expect(
        pack.emptyUnless.some(
          (m) => m.endsWith("catalog.sqlite") || m === "catalog.sqlite",
        ),
        id,
      ).toBe(true);
    }
  });

  it("Pokémon keeps Live foil dump as live.sqlite sibling of identity catalog.sqlite", () => {
    const pack = cataloguePackInfo("pokemon");
    expect(pack?.extractMarkers).toContain("live.sqlite");
    expect(pack?.extractMarkers).toContain("catalog.sqlite");
    expect(pack?.emptyUnless).toContain("live.sqlite");
  });
});

describe("listSetPrints includeUnprinted contract (all TCG modules)", () => {
  const modules = [
    "tcgdex",
    "lorcanatcg",
    "narutocarddass",
    "onepiece",
    "yugioh",
    "mtg",
    "dbscg",
    "dbsfw",
    "narutokayou",
  ] as const;

  it.each(modules)(
    "%s listSetPrints accepts includeUnprinted and defaults to cardboard",
    async (id) => {
      const mod = getProviderModule(id);
      if (!mod?.listSetPrints || !mod.listPrintSets) return;

      const sets = await Promise.resolve(mod.listPrintSets("tcg", "fr"));
      const setId = sets[0]?.id;
      if (!setId) return;

      const checklist = await mod.listSetPrints({
        setId,
        language: "fr",
        includeUnprinted: false,
      });
      expect(checklist.every((row) => row.printed !== false)).toBe(true);

      const admin = await mod.listSetPrints({
        setId,
        language: "fr",
        includeUnprinted: true,
      });
      const checklistKeys = new Set(checklist.map((row) => row.printKey));
      for (const row of checklist.slice(0, 40)) {
        expect(admin.some((a) => a.printKey === row.printKey)).toBe(true);
      }
      for (const row of admin) {
        if (checklistKeys.has(row.printKey)) continue;
        expect(row.printed).toBe(false);
      }
    },
    60_000,
  );
});
