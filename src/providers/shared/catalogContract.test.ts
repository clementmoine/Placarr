/**
 * Tests — durableCdn + ingest ledger + anti-désync identity browse.
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
    "Pokémon identity browse printKeys ⊆ checklist sqlite (same corpus)",
    () => {
      const checklist = new Set(
        listTcgdexRowsForLanguage("fr").map((r) => r.printKey),
      );
      if (checklist.size === 0) return; // no local corpus in CI sandbox

      const browse = tryBuildIdentityCatalogueRows("pokemon");
      expect(browse).not.toBeNull();
      const faces = (browse ?? []).filter((r) => r.kind !== "pack-back");
      expect(faces.length).toBeGreaterThan(0);
      for (const row of faces.slice(0, 50)) {
        if (row.lang !== "fr") continue;
        expect(checklist.has(row.printKey)).toBe(true);
      }
      expect(faces.every((r) => r.printKey.includes(":"))).toBe(true);
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

  it("One Piece + Yu-Gi-Oh! browse from identity sqlite", () => {
    for (const pack of ["onepiece", "yugioh"] as const) {
      const browse = tryBuildIdentityCatalogueRows(pack);
      if (browse === null) continue; // no local corpus in CI
      expect(browse.length).toBeGreaterThan(0);
      expect(browse.every((r) => r.printKey.includes(":"))).toBe(true);
    }
  });

  it("Carddass identity browse is non-null when catalog.sqlite exists", () => {
    const db = ensureNarutoPackIndex(NARUTO_PACK_ID);
    if (!db) return; // no local corpus in CI sandbox

    const browse = tryBuildIdentityCatalogueRows("naruto/carddass");
    expect(browse).not.toBeNull();
    expect((browse ?? []).length).toBeGreaterThan(0);
    expect(browse!.every((r) => r.printKey.includes(":"))).toBe(true);
  });

  it("Carddass admin browse printKeys ⊆ catalog.sqlite (same corpus)", () => {
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
  });

  it("TCG packs do not require cards-index.json as emptyUnless / extractMarkers", () => {
    const tcgPacks = [
      "pokemon",
      "lorcana",
      "naruto/carddass",
      "onepiece",
      "yugioh",
      "dragonball/cg",
      "dragonball/fw",
    ] as const;
    for (const id of tcgPacks) {
      const pack = cataloguePackInfo(id);
      if (!pack) continue;
      expect(pack.emptyUnless, id).not.toContain("cards-index.json");
      expect(pack.extractMarkers, id).not.toContain("cards-index.json");
      expect(
        pack.emptyUnless.some((m) => m.endsWith("catalog.sqlite") || m === "catalog.sqlite"),
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
