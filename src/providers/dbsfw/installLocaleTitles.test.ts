import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DBS_FW_PACK_ID,
  ensureDbsFwIndex,
  resetDbsFwDbCache,
  writeDbsFwIndex,
} from "./indexStore";
import { installDbsFwLocaleTitles } from "./installLocaleTitles";

let tmp: string;

const tile = (over: Record<string, unknown>) => ({
  itemId: null,
  slug: "jp-fb09-001-l-gogeta-br",
  ref: "fb09-001",
  sku: "FB09-001-L",
  name: "ゴジータ:BR",
  lang: "jp",
  priceText: null,
  price: null,
  currency: null,
  priceDeltaText: null,
  priceDelta: null,
  imageFront: "https://static.fw.dbscards.fr/cards/jp/fb09/…-gogeta-br.webp",
  imageBack: null,
  ...over,
});

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "dbsfw-"));
  process.env.PLACARR_DBSFW_DB = path.join(tmp, "catalog.sqlite");
  process.env.PLACARR_DATA_DIR = tmp;
  resetDbsFwDbCache();
  writeDbsFwIndex({
    prints: [
      { printKey: "dbsfw:fb09-001", setCode: "fb09", number: "001" },
      // A parallel of the same card: same name, its own printing.
      {
        printKey: "dbsfw:fb09-001-p1",
        setCode: "fb09",
        number: "001",
        grouping: "p1",
      },
      { printKey: "dbsfw:fb09-999", setCode: "fb09", number: "999" },
    ],
    titles: [
      {
        printKey: "dbsfw:fb09-001",
        lang: "en",
        fullName: "Gogeta:BR",
      },
    ],
    assets: [],
    dbPath: process.env.PLACARR_DBSFW_DB,
  });
  resetDbsFwDbCache();

  const dir = path.join(tmp, DBS_FW_PACK_ID);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "dbscards-ja.json"),
    JSON.stringify([tile({})]),
    "utf8",
  );
});

afterEach(() => {
  resetDbsFwDbCache();
  delete process.env.PLACARR_DBSFW_DB;
  delete process.env.PLACARR_DATA_DIR;
  rmSync(tmp, { recursive: true, force: true });
});

describe("installDbsFwLocaleTitles", () => {
  it("gives a Japanese title to the printings dbscards lists", () => {
    /*
      Without this the Japanese faces are downloaded and never shown: a card is
      served from its own locale folder, and with no `ja` title row there is no
      `ja` card to serve.
    */
    const result = installDbsFwLocaleTitles("ja");
    expect(result.written).toBe(2);
    expect(result.missing).toBe(1);

    const db = ensureDbsFwIndex()!;
    const rows = db
      .prepare(
        "SELECT print_key AS k, full_name AS n FROM print_titles WHERE lang = 'ja' ORDER BY k",
      )
      .all() as Array<{ k: string; n: string }>;
    expect(rows.map((r) => r.k)).toEqual([
      "dbsfw:fb09-001",
      "dbsfw:fb09-001-p1",
    ]);
    expect(rows[0]?.n).toBe("ゴジータ:BR");
  });

  it("leaves the English titles alone", () => {
    installDbsFwLocaleTitles("ja");
    const db = ensureDbsFwIndex()!;
    const en = db
      .prepare(
        "SELECT full_name AS n FROM print_titles WHERE lang = 'en' AND print_key = ?",
      )
      .get("dbsfw:fb09-001") as { n: string } | undefined;
    expect(en?.n).toBe("Gogeta:BR");
  });

  it("does nothing when the list was never crawled", () => {
    // Absence is not an error: the pack simply stays English-only.
    expect(installDbsFwLocaleTitles("ko")).toEqual({
      lang: "ko",
      written: 0,
      missing: 0,
    });
  });
});
