/**
 * localTcgLine face URLs — canonical `{set}/{lang}/{card}/` + cross-locale borrow.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalTcgLine } from "./localTcgLine";
import { createLocalPrintsIndex } from "./localPrintsIndex";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

function tmpDataRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-tcg-line-"));
  roots.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  return root;
}

describe("localTcgLine face URLs", () => {
  it("builds assetsCardUrl order set/lang/card", () => {
    tmpDataRoot();
    const packId = "naruto/ninja-ranks";
    const index = createLocalPrintsIndex(packId);
    index.writePrints([
      {
        printKey: "naruto:nr-0001",
        setCode: "nr",
        number: "0001",
        cardType: "nr",
        titles: [{ lang: "fr", fullName: "Carte" }],
      },
    ]);
    index.writeAssets([
      { printKey: "naruto:nr-0001", lang: "fr", art: "art.coleka.webp" },
    ]);

    const line = createLocalTcgLine({
      providerId: "narutoranks",
      providerLabel: "test",
      catalogueLabel: "test",
      factLabel: "test",
      packId,
      effectPackId: "naruto-ninja-ranks",
      printGame: "naruto",
      defaultLanguage: "fr",
      syncHint: "test",
      notes: "test",
    });

    const hit = line.lookupPrint("naruto:nr-0001", "fr");
    expect(hit?.imageUrl).toBe(
      "/assets/naruto/ninja-ranks/cards/nr/fr/0001/art.coleka.webp",
    );
  });

  it("prefers defaultLanguage when lookupPrint is called without language", () => {
    tmpDataRoot();
    const packId = "naruto/ninja-ranks";
    const index = createLocalPrintsIndex(packId);
    index.writePrints([
      {
        printKey: "naruto:nr-0003",
        setCode: "nr",
        number: "0003",
        cardType: "nr",
        titles: [
          { lang: "en", fullName: "EN title" },
          { lang: "fr", fullName: "FR title" },
        ],
      },
    ]);
    index.writeAssets([
      { printKey: "naruto:nr-0003", lang: "en", art: "art.en.webp" },
      { printKey: "naruto:nr-0003", lang: "fr", art: "art.fr.webp" },
    ]);

    const line = createLocalTcgLine({
      providerId: "narutoranks",
      providerLabel: "test",
      catalogueLabel: "test",
      factLabel: "test",
      packId,
      effectPackId: "naruto-ninja-ranks",
      printGame: "naruto",
      defaultLanguage: "fr",
      syncHint: "test",
      notes: "test",
    });

    const hit = line.lookupPrint!("naruto:nr-0003");
    expect(hit?.language).toBe("fr");
    expect(hit?.title).toBe("FR title");
    expect(hit?.imageUrl).toBe(
      "/assets/naruto/ninja-ranks/cards/nr/fr/0003/art.fr.webp",
    );
  });

  it("borrows art from another locale when enabled", () => {
    tmpDataRoot();
    const packId = "naruto/ninja-ranks";
    const index = createLocalPrintsIndex(packId);
    index.writePrints([
      {
        printKey: "naruto:nr-0002",
        setCode: "nr",
        number: "0002",
        cardType: "nr",
        titles: [
          { lang: "fr", fullName: "FR" },
          { lang: "en", fullName: "EN" },
        ],
      },
    ]);
    index.writeAssets([
      { printKey: "naruto:nr-0002", lang: "en", art: "art.coleka.webp" },
    ]);

    const without = createLocalTcgLine({
      providerId: "narutoranks",
      providerLabel: "test",
      catalogueLabel: "test",
      factLabel: "test",
      packId,
      effectPackId: "naruto-ninja-ranks",
      printGame: "naruto",
      defaultLanguage: "fr",
      syncHint: "test",
      notes: "test",
    });
    expect(without.lookupPrint("naruto:nr-0002", "fr")?.imageUrl).toBeUndefined();

    const withBorrow = createLocalTcgLine({
      providerId: "narutoranks",
      providerLabel: "test",
      catalogueLabel: "test",
      factLabel: "test",
      packId,
      effectPackId: "naruto-ninja-ranks",
      printGame: "naruto",
      defaultLanguage: "fr",
      syncHint: "test",
      notes: "test",
      borrowFaceAcrossLocales: true,
    });
    const hit = withBorrow.lookupPrint("naruto:nr-0002", "fr");
    expect(hit?.language).toBe("fr");
    expect(hit?.imageUrl).toBe(
      "/assets/naruto/ninja-ranks/cards/nr/en/0002/art.coleka.webp",
    );
  });

  it("honours cardAssetUrl override (Carddass-like set/card/lang)", () => {
    tmpDataRoot();
    const packId = "naruto/shippuden";
    const index = createLocalPrintsIndex(packId);
    index.writePrints([
      {
        printKey: "naruto:msa-0026",
        setCode: "msa",
        number: "msa0026",
        cardType: "msa",
        titles: [{ lang: "ja", fullName: "作" }],
      },
    ]);
    index.writeAssets([
      { printKey: "naruto:msa-0026", lang: "ja", art: "art.nikita.jpg" },
    ]);

    const line = createLocalTcgLine({
      providerId: "narutoshippuden",
      providerLabel: "test",
      catalogueLabel: "test",
      factLabel: "test",
      packId,
      effectPackId: "naruto-shippuden",
      printGame: "naruto",
      defaultLanguage: "unknown",
      syncHint: "test",
      notes: "test",
      cardAssetUrl: (id, file) =>
        `/assets/${packId}/cards/${id.set}/${id.card}/${id.lang}/${file}`,
    });

    expect(line.lookupPrint("naruto:msa-0026", "ja")?.imageUrl).toBe(
      "/assets/naruto/shippuden/cards/msa/msa0026/ja/art.nikita.jpg",
    );
  });
});

describe("localTcgLine metadata adapter", () => {
  it("resolves cover from printKey via the same face URL as lookupPrint", async () => {
    tmpDataRoot();
    const packId = "naruto/ultra-challenge";
    const index = createLocalPrintsIndex(packId);
    index.writePrints([
      {
        printKey: "naruto:uc-0001",
        setCode: "uc",
        number: "0001",
        cardType: "uc",
        titles: [{ lang: "fr", fullName: "Naruto" }],
      },
    ]);
    index.writeAssets([
      { printKey: "naruto:uc-0001", lang: "fr", art: "art.coleka.webp" },
    ]);

    const line = createLocalTcgLine({
      providerId: "narutoultra",
      providerLabel: "Ultra",
      catalogueLabel: "Ultra",
      factLabel: "Ultra",
      packId,
      effectPackId: "naruto-ultra-challenge",
      printGame: "naruto",
      defaultLanguage: "fr",
      syncHint: "test",
      notes: "test",
    });
    const module = line.attachCatalog({
      dataPack: packId,
      status: async () => ({ empty: false, stale: false, lastSyncAt: null }),
      refresh: async () => {},
    });

    expect(typeof module.createMetadataAdapter).toBe("function");
    const adapter = module.createMetadataAdapter!();
    expect(adapter).not.toBeNull();
    const hit = await adapter!.resolve({
      name: "ignored",
      printKey: "naruto:uc-0001",
    });
    expect(hit?.title).toBe("Naruto");
    expect(hit?.imageUrl).toBe(
      "/assets/naruto/ultra-challenge/cards/uc/fr/0001/art.coleka.webp",
    );
    expect(hit?.externalIds?.printKey).toBe("naruto:uc-0001");
    expect(hit?.externalIds?.narutoultra).toBe("naruto:uc-0001");
  });

  it("returns null for a foreign printGame (no name fallback)", async () => {
    tmpDataRoot();
    const packId = "naruto/ultra-challenge";
    createLocalPrintsIndex(packId).writePrints([]);

    const line = createLocalTcgLine({
      providerId: "narutoultra",
      providerLabel: "Ultra",
      catalogueLabel: "Ultra",
      factLabel: "Ultra",
      packId,
      effectPackId: "naruto-ultra-challenge",
      printGame: "naruto",
      defaultLanguage: "fr",
      syncHint: "test",
      notes: "test",
    });
    const adapter = line.attachCatalog({
      dataPack: packId,
      status: async () => ({ empty: true, stale: true, lastSyncAt: null }),
      refresh: async () => {},
    }).createMetadataAdapter!();
    expect(adapter).not.toBeNull();

    expect(
      await adapter!.resolve({ name: "Inari", printKey: "lorcana:6-48" }),
    ).toBeNull();
    expect(await adapter!.resolve({ name: "Inari" })).toBeNull();
  });
});
