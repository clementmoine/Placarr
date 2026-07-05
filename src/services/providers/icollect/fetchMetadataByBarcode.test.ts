import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PAGE_CATALOG_REFRESH_MS,
  rememberICollectBarcodeMappings,
  rememberICollectItemCatalog,
  resetICollectIndexForTests,
} from "./indexStore";
import { fetchICollectMetadataByBarcode } from "./fetch";
import { MARIO_KART_ITEM_HTML } from "./fetchMetadataByBarcode.fixtures";

vi.mock("axios");

describe("fetchICollectMetadataByBarcode", () => {
  let tempDir = "";

  beforeEach(() => {
    resetICollectIndexForTests();
    tempDir = mkdtempSync(path.join(tmpdir(), "icollect-fetch-"));
    process.env.ICOLLECT_INDEX_PATH = path.join(tempDir, "videogames.sqlite");
    vi.mocked(axios.get).mockReset();
  });

  afterEach(() => {
    resetICollectIndexForTests();
    delete process.env.ICOLLECT_INDEX_PATH;
    delete process.env.RECORD;
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  async function seedBarcodeIndex() {
    const { ensureICollectIndex } = await import("./indexStore");
    const db = await ensureICollectIndex();
    expect(db).not.toBeNull();
    if (!db) return null;

    rememberICollectBarcodeMappings(db, [
      {
        barcodeKey: "45496365226",
        rawBarcode: "045496365226",
        itemId: "892033",
        itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      },
    ]);
    return db;
  }

  it("returns fresh page cache without hitting the network", async () => {
    const db = await seedBarcodeIndex();
    if (!db) return;

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      platform: "Nintendo Wii",
      catalogSource: "page",
    });

    const metadata = await fetchICollectMetadataByBarcode("045496365226");
    expect(metadata?.platform).toBe("Nintendo Wii");
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("fetches and merges when only sitemap metadata exists", async () => {
    const db = await seedBarcodeIndex();
    if (!db) return;

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      coverUrl:
        "https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg",
      images: [
        {
          url: "https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg",
        },
      ],
      catalogSource: "sitemap",
    });

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: MARIO_KART_ITEM_HTML,
      status: 200,
    });

    const metadata = await fetchICollectMetadataByBarcode("045496365226");
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(metadata?.platform).toBe("Nintendo Wii");
    expect(metadata?.publisher).toBe("Nintendo");

    const row = db
      .prepare("SELECT payload FROM item_metadata WHERE item_id = ?")
      .get("892033") as { payload?: string } | undefined;
    const payload = JSON.parse(row?.payload || "{}");
    expect(payload.catalogSource).toBe("page");
    expect(payload.platform).toBe("Nintendo Wii");
    expect(payload.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.icollecteverything.com/images/videogame/main/89/892033_1.jpg",
        }),
      ]),
    );
  });

  it("refreshes stale page rows on lookup", async () => {
    const db = await seedBarcodeIndex();
    if (!db) return;

    rememberICollectItemCatalog(db, {
      itemId: "892033",
      itemUrl: "https://www.icollecteverything.com/db/item/videogame/892033/",
      title: "Mario Kart Wii",
      platform: "Nintendo Wii",
      estimatedValueCents: 1000,
      catalogSource: "page",
    });

    const staleAt =
      Date.now() - DEFAULT_PAGE_CATALOG_REFRESH_MS - 60_000;
    db.prepare("UPDATE item_metadata SET fetched_at = ? WHERE item_id = ?").run(
      staleAt,
      "892033",
    );

    vi.mocked(axios.get).mockResolvedValueOnce({
      data: MARIO_KART_ITEM_HTML,
      status: 200,
    });

    const metadata = await fetchICollectMetadataByBarcode("045496365226");
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(metadata?.estimatedValueCents).toBe(1875);
  });
});
