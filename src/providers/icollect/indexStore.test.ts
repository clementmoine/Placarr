import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_CATALOG_REFRESH_MS,
  ensureICollectIndex,
  extractBarcodeEntriesFromSitemapXml,
  extractSitemapCatalogBlocks,
  isICollectItemPageCatalogStale,
  parseTitleFromSitemapCaption,
  rememberICollectBarcodeMappings,
  rememberICollectItemCatalog,
  resetICollectIndexForTests,
  shouldRefreshICollectItemPage,
  shouldFetchICollectItemPageOnLookup,
  sitemapBlockToMetadata,
} from "./indexStore";

let tempDir = "";

const SITEMAP_SNIPPET = `
<url>
  <loc>https://www.icollecteverything.com/db/item/videogame/892033/</loc>
  <image:image>
    <image:loc>https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg</image:loc>
    <image:caption>Mario Kart Wii video game collectible [Barcode 045496365226] - Main Image 1</image:caption>
  </image:image>
  <image:image>
    <image:loc>https://www.icollecteverything.com/images/videogame/main/89/892033_2.jpg</image:loc>
    <image:caption>Mario Kart Wii video game collectible [Barcode 045496365226] - Main Image 2</image:caption>
  </image:image>
</url>
<url>
  <loc>https://www.icollecteverything.com/db/item/videogame/892034/</loc>
  <image:image>
    <image:caption>Other Game [Barcode 0045496364649] - Main Image 1</image:caption>
  </image:image>
</url>
`;

describe("extractSitemapCatalogBlocks", () => {
  it("indexes barcodes with title and image URLs from sitemap captions", () => {
    const blocks = extractSitemapCatalogBlocks(SITEMAP_SNIPPET);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      itemId: "892033",
      title: "Mario Kart Wii",
      coverUrl:
        "https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg",
    });
    expect(blocks[0]?.images).toHaveLength(2);
    expect(blocks[0]?.barcodes).toEqual([
      { barcodeKey: "45496365226", rawBarcode: "045496365226" },
    ]);
  });

  it("builds offline catalog metadata from a sitemap block", () => {
    const block = extractSitemapCatalogBlocks(SITEMAP_SNIPPET)[0]!;
    expect(sitemapBlockToMetadata(block)).toMatchObject({
      itemId: "892033",
      title: "Mario Kart Wii",
      barcode: "045496365226",
      catalogSource: "sitemap",
    });
  });
});

describe("parseTitleFromSitemapCaption", () => {
  it("extracts the official title before the collectible suffix", () => {
    expect(
      parseTitleFromSitemapCaption(
        "Wii Sports video game collectible [Barcode 123] - Main Image 1",
      ),
    ).toBe("Wii Sports");
  });
});

describe("extractBarcodeEntriesFromSitemapXml", () => {
  it("indexes unique normalized barcodes per sitemap url block", () => {
    const entries = extractBarcodeEntriesFromSitemapXml(SITEMAP_SNIPPET);
    expect(entries).toEqual([
      {
        barcodeKey: "45496365226",
        rawBarcode: "045496365226",
        itemId: "892033",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      },
      {
        barcodeKey: "45496364649",
        rawBarcode: "0045496364649",
        itemId: "892034",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892034/",
      },
    ]);
  });
});

describe("rememberICollectItemCatalog", () => {
  beforeEach(() => {
    resetICollectIndexForTests();
    tempDir = mkdtempSync(path.join(tmpdir(), "icollect-index-"));
    process.env.ICOLLECT_INDEX_PATH = path.join(tempDir, "videogames.sqlite");
  });

  afterEach(() => {
    resetICollectIndexForTests();
    delete process.env.ICOLLECT_INDEX_PATH;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it("keeps a full page row when a sitemap row already exists", async () => {
    const db = await ensureICollectIndex();
    expect(db).not.toBeNull();
    if (!db) return;

    rememberICollectBarcodeMappings(db, [
      {
        barcodeKey: "45496365226",
        rawBarcode: "045496365226",
        itemId: "892033",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      },
    ]);

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      images: [],
      catalogSource: "sitemap",
    });

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      platform: "Nintendo Wii",
      images: [],
      catalogSource: "page",
    });

    const row = db
      .prepare("SELECT payload FROM item_metadata WHERE item_id = ?")
      .get("892033") as { payload?: string } | undefined;
    const payload = JSON.parse(row?.payload || "{}");
    expect(payload.catalogSource).toBe("page");
    expect(payload.platform).toBe("Nintendo Wii");
  });

  it("merges page refresh without dropping existing fields", async () => {
    const db = await ensureICollectIndex();
    expect(db).not.toBeNull();
    if (!db) return;

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      platform: "Nintendo Wii",
      publisher: "Nintendo",
      images: [{ url: "https://example.com/cover.jpg" }],
      catalogSource: "page",
    });

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      platform: null,
      publisher: null,
      estimatedValueCents: 2500,
      images: [],
      catalogSource: "page",
    });

    const row = db
      .prepare("SELECT payload FROM item_metadata WHERE item_id = ?")
      .get("892033") as { payload?: string } | undefined;
    const payload = JSON.parse(row?.payload || "{}");
    expect(payload.platform).toBe("Nintendo Wii");
    expect(payload.publisher).toBe("Nintendo");
    expect(payload.estimatedValueCents).toBe(2500);
    expect(payload.images).toEqual([{ url: "https://example.com/cover.jpg" }]);
  });

  it("marks page rows stale after the refresh interval", async () => {
    const db = await ensureICollectIndex();
    expect(db).not.toBeNull();
    if (!db) return;

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      catalogSource: "page",
      images: [],
    });

    const staleAt = Date.now() - DEFAULT_PAGE_CATALOG_REFRESH_MS - 60_000;
    db.prepare("UPDATE item_metadata SET fetched_at = ? WHERE item_id = ?").run(
      staleAt,
      "892033",
    );

    expect(isICollectItemPageCatalogStale(db, "892033")).toBe(true);
    expect(shouldRefreshICollectItemPage(db, "892033")).toBe(true);

    db.prepare("UPDATE item_metadata SET fetched_at = ? WHERE item_id = ?").run(
      Date.now(),
      "892033",
    );

    expect(isICollectItemPageCatalogStale(db, "892033")).toBe(false);
    expect(shouldRefreshICollectItemPage(db, "892033")).toBe(false);
  });

  it("lookup gate treats sitemap title as Tier0 (sync still refreshes)", async () => {
    const db = await ensureICollectIndex();
    expect(db).not.toBeNull();
    if (!db) return;

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      catalogSource: "sitemap",
      images: [],
    });

    expect(shouldRefreshICollectItemPage(db, "892033")).toBe(true);
    expect(
      shouldFetchICollectItemPageOnLookup(db, "892033", {
        title: "Mario Kart Wii",
        catalogSource: "sitemap",
      }),
    ).toBe(false);
  });
});
