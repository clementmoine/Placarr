import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: vi.fn(),
}));

import { httpGet } from "@/lib/http/httpClient";
import { packCardDir } from "@/lib/packPaths";
import { softbanRemainingMs } from "@/providers/shared/softban";

import {
  DBS_MASTERS_DECKPLANET_BASE,
  DBS_MASTERS_GITHUB_PAGES_BASE,
  dbsMastersFaceUrls,
  fetchDbsCgFaces,
  isWebpBuffer,
} from "./fetchFaces";
import {
  DBS_CG_PACK_ID,
  exportDbsCgCardsIndexJson,
  resetDbsCgDbCache,
  writeDbsCgIndex,
} from "./indexStore";

const mockedGet = vi.mocked(httpGet);

function tinyWebp(): Buffer {
  const buf = Buffer.alloc(128, 0);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(120, 4);
  buf.write("WEBP", 8);
  return buf;
}

function artPath(lang = "fr"): string {
  return path.join(
    packCardDir(DBS_CG_PACK_ID, { set: "bt1", lang, card: "001" }),
    "art.webp",
  );
}

describe("dbsMastersFaceUrls", () => {
  it("points at Deckplanet then GitHub Pages", () => {
    expect(dbsMastersFaceUrls("bt1", "BT1-001")).toEqual([
      `${DBS_MASTERS_DECKPLANET_BASE}/BT1-001.webp`,
      `${DBS_MASTERS_GITHUB_PAGES_BASE}/BT1/BT1-001.webp`,
    ]);
    expect(dbsMastersFaceUrls("bt1", "BT1-011_SPR")[0]).toBe(
      `${DBS_MASTERS_DECKPLANET_BASE}/BT1-011_SPR.webp`,
    );
  });

  it("recognises a RIFF/WEBP header", () => {
    expect(isWebpBuffer(tinyWebp())).toBe(true);
    expect(isWebpBuffer(Buffer.from("<html>"))).toBe(false);
  });
});

describe("exportDbsCgCardsIndexJson local art", () => {
  let tmp: string;
  let prevData: string | undefined;
  let prevDb: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "dbscg-faces-"));
    prevData = process.env.PLACARR_DATA_DIR;
    prevDb = process.env.PLACARR_DBSCG_DB;
    process.env.PLACARR_DATA_DIR = tmp;
    process.env.PLACARR_DBSCG_DB = path.join(tmp, "dbs/cg/catalog.sqlite");
    resetDbsCgDbCache();
  });

  afterEach(() => {
    resetDbsCgDbCache();
    if (prevData === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = prevData;
    if (prevDb === undefined) delete process.env.PLACARR_DBSCG_DB;
    else process.env.PLACARR_DBSCG_DB = prevDb;
    rmSync(tmp, { recursive: true, force: true });
  });

  const print = {
    printKey: "dbscg:bt1-001",
    setCode: "bt1",
    number: "001",
  };
  const asset = {
    printKey: "dbscg:bt1-001",
    lang: "fr",
    imageUrl:
      "https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/BT1-001.png",
  };

  it("keeps Bandai artUrl when no local file exists", () => {
    const out = path.join(tmp, "cards-index.json");
    exportDbsCgCardsIndexJson([print], [], [asset], out);
    const json = JSON.parse(readFileSync(out, "utf8")) as {
      cards: Record<
        string,
        { langs: { fr?: { art?: string; artUrl?: string } } }
      >;
    };
    expect(json.cards["dbscg:bt1-001"]?.langs.fr?.art).toBeUndefined();
    expect(json.cards["dbscg:bt1-001"]?.langs.fr?.artUrl).toContain(
      "BT1-001.png",
    );
  });

  it("sets langs.fr.art when art.webp is on disk", () => {
    mkdirSync(path.dirname(artPath()), { recursive: true });
    writeFileSync(artPath(), tinyWebp());
    const out = path.join(tmp, "cards-index.json");
    exportDbsCgCardsIndexJson([print], [], [asset], out);
    const json = JSON.parse(readFileSync(out, "utf8")) as {
      cards: Record<
        string,
        { langs: { fr?: { art?: string; artUrl?: string } } }
      >;
    };
    expect(json.cards["dbscg:bt1-001"]?.langs.fr?.art).toBe("art.webp");
    expect(json.cards["dbscg:bt1-001"]?.langs.fr?.artUrl).toContain(
      "BT1-001.png",
    );
  });
});

describe("fetchDbsCgFaces", () => {
  let tmp: string;
  let prevData: string | undefined;
  let prevDb: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), "dbscg-fetch-"));
    prevData = process.env.PLACARR_DATA_DIR;
    prevDb = process.env.PLACARR_DBSCG_DB;
    process.env.PLACARR_DATA_DIR = tmp;
    process.env.PLACARR_DBSCG_DB = path.join(tmp, "dbs/cg/catalog.sqlite");
    resetDbsCgDbCache();
    writeDbsCgIndex({
      prints: [{ printKey: "dbscg:bt1-001", setCode: "bt1", number: "001" }],
      titles: [
        {
          printKey: "dbscg:bt1-001",
          lang: "fr",
          fullName: "Champa",
        },
      ],
      assets: [
        {
          printKey: "dbscg:bt1-001",
          lang: "fr",
          imageUrl:
            "https://www.dbs-cardgame.com/europe-fr/images/cartes/cardimg/BT1-001.png",
        },
      ],
    });
    resetDbsCgDbCache();
    mockedGet.mockReset();
  });

  afterEach(() => {
    resetDbsCgDbCache();
    if (prevData === undefined) delete process.env.PLACARR_DATA_DIR;
    else process.env.PLACARR_DATA_DIR = prevData;
    if (prevDb === undefined) delete process.env.PLACARR_DBSCG_DB;
    else process.env.PLACARR_DBSCG_DB = prevDb;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("writes art.webp and indexes langs.fr.art, asking dbscards first", async () => {
    mockedGet.mockResolvedValue({
      data: tinyWebp(),
      status: 200,
    } as never);
    const result = await fetchDbsCgFaces({
      delayMs: 0,
      concurrency: 1,
      langs: ["fr"],
    });
    expect(result.ok).toBe(1);
    expect(existsArt()).toBe(true);
    // dbscards leads because it is the only 400x560 source; every host behind
    // it serves Bandai's 260x363.
    expect(String(mockedGet.mock.calls[0]?.[0])).toContain(
      "static.dbscards.fr",
    );
    const index = JSON.parse(
      readFileSync(path.join(tmp, "dbs/cg/cards-index.json"), "utf8"),
    ) as {
      cards: Record<string, { langs: { fr?: { art?: string } } }>;
    };
    expect(index.cards["dbscg:bt1-001"]?.langs.fr?.art).toBe("art.webp");
  });

  it("skips an existing face unless --force", async () => {
    mkdirSync(path.dirname(artPath()), { recursive: true });
    writeFileSync(artPath(), tinyWebp());
    const result = await fetchDbsCgFaces({
      delayMs: 0,
      concurrency: 1,
      langs: ["fr"],
    });
    expect(result.skip).toBe(1);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  /**
   * A bulk pass got 403 from dbscards and quietly used Bandai's 260x363 instead,
   * reporting `miss=0 fail=0`. Half the catalogue was downgraded with nothing in
   * the log to show for it — so a refusal to serve now has to be counted.
   */

  it("counts a print whose preferred source refused, though it got a face", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).includes("dbscards.fr")) {
        throw Object.assign(new Error("403"), { response: { status: 403 } });
      }
      return { data: tinyWebp(), status: 200 } as never;
    });
    const result = await fetchDbsCgFaces({
      delayMs: 0,
      concurrency: 1,
      langs: ["fr"],
    });
    // The face exists, so this is not a miss — but it is not the one we wanted.
    expect(result.ok).toBe(1);
    expect(result.miss).toBe(0);
    expect(result.throttled).toBe(1);
  });

  it("stops asking a host that already refused, instead of hammering it", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).includes("dbscards.fr")) {
        throw Object.assign(new Error("403"), { response: { status: 403 } });
      }
      return { data: tinyWebp(), status: 200 } as never;
    });
    // Both locales, so the second one runs after the ban is known.
    await fetchDbsCgFaces({ delayMs: 0, concurrency: 1 });
    const tries = mockedGet.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("dbscards.fr"));
    // One refusal is enough to learn; the rest of the run leaves them alone.
    expect(tries.length).toBe(1);
  });

  it("persists a cooldown so the next run does not re-hammer the host", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).includes("dbscards.fr")) {
        throw Object.assign(new Error("403"), { response: { status: 403 } });
      }
      return { data: tinyWebp(), status: 200 } as never;
    });
    await fetchDbsCgFaces({ delayMs: 0, concurrency: 1, langs: ["fr"] });
    expect(
      softbanRemainingMs(path.join(tmp, "dbs/cg"), Date.now(), "faces"),
    ).toBeGreaterThan(0);

    // A second run must not touch the banned host at all while it cools down.
    mockedGet.mockClear();
    await fetchDbsCgFaces({
      delayMs: 0,
      concurrency: 1,
      langs: ["fr"],
      force: true,
    });
    const tried = mockedGet.mock.calls.map((call) => String(call[0]));
    expect(tried.some((url) => url.includes("dbscards.fr"))).toBe(false);
  });

  it("does not count a plain 404 as throttling", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (String(url).includes("dbscards.fr")) {
        throw Object.assign(new Error("404"), { response: { status: 404 } });
      }
      return { data: tinyWebp(), status: 200 } as never;
    });
    const result = await fetchDbsCgFaces({
      delayMs: 0,
      concurrency: 1,
      langs: ["fr"],
    });
    expect(result.throttled).toBe(0);
  });
});

function existsArt(lang = "fr"): boolean {
  try {
    return readFileSync(artPath(lang)).length >= 12;
  } catch {
    return false;
  }
}
