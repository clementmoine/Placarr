import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpGet, httpPost } from "@/lib/http/httpClient";

import { parseDbsCardlistHtml } from "../parse/cardlist";
import {
  keepFailedLocaleRows,
  rowsFromCards,
  scrapeDbsCgCardlist,
} from "./cardlist";

vi.mock("@/lib/http/httpClient", () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock("../indexStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../indexStore")>();
  return {
    ...actual,
    writeDbsCgIndex: vi.fn(() => ({
      dbPath: "/tmp/dbscg-test.sqlite",
      printCount: 1,
    })),
    loadDbsCgIndex: vi.fn(() => null),
  };
});

vi.mock("./mergeDbscardsTokens", () => ({
  loadDbscardsTokenCards: () => [],
}));

const dir = path.dirname(fileURLToPath(import.meta.url));
const frFixture = readFileSync(
  path.join(dir, "../fixtures/bt1-sample.html"),
  "utf8",
);
const enFixture = readFileSync(
  path.join(dir, "../fixtures/bt1-en-leader.html"),
  "utf8",
);

const indexHtml = `
<select name="category_exp">
  <option value="">Unspecified</option>
  <option value="461001">BT1 Booster -GALACTIC BATTLE-</option>
</select>
`;

describe("rowsFromCards", () => {
  it("merges FR and EN batches on printKey and keeps both names", () => {
    const { prints, titles, assets } = rowsFromCards([
      ...parseDbsCardlistHtml(frFixture, "fr"),
      ...parseDbsCardlistHtml(enFixture, "en"),
    ]);
    expect(prints.map((row) => row.printKey)).toEqual([
      "dbscg:bt1-001",
      "dbscg:bt1-005",
      "dbscg:bt1-011-spr",
    ]);
    const champa = titles.filter((row) => row.printKey === "dbscg:bt1-001");
    expect(champa).toHaveLength(2);
    expect(champa.find((row) => row.lang === "fr")?.awakenedName).toBe(
      "Champa, Dieu de la destruction",
    );
    expect(champa.find((row) => row.lang === "en")?.awakenedName).toBe(
      "God of Destruction Champa",
    );
    expect(
      assets
        .filter((row) => row.printKey === "dbscg:bt1-001")
        .map((row) => row.lang),
    ).toEqual(["fr", "en"]);
    expect(assets.find((row) => row.lang === "en")?.imageUrl).toContain(
      "/images/cardlist/cardimg/BT1-001.png",
    );
  });
});

describe("keepFailedLocaleRows", () => {
  const existing = {
    prints: [
      { printKey: "dbscg:bt1-001", setCode: "bt1", number: "001" },
      // Known only through the FR cardlist.
      { printKey: "dbscg:bt1-999", setCode: "bt1", number: "999" },
    ],
    titles: [
      { printKey: "dbscg:bt1-001", lang: "fr", fullName: "Champa" },
      { printKey: "dbscg:bt1-001", lang: "en", fullName: "Champa EN" },
      { printKey: "dbscg:bt1-999", lang: "fr", fullName: "Seulement FR" },
    ],
    assets: [
      { printKey: "dbscg:bt1-001", lang: "fr", art: "fr.png" },
      { printKey: "dbscg:bt1-999", lang: "fr", art: "999.png" },
    ],
  };

  it("keeps a failed locale's rows instead of shrinking the corpus", () => {
    // FR cardlist aborted mid-Sync (`stream has been aborted`), EN came back.
    const next = {
      prints: [{ printKey: "dbscg:bt1-001", setCode: "bt1", number: "001" }],
      titles: [
        { printKey: "dbscg:bt1-001", lang: "en", fullName: "Champa EN v2" },
      ],
      assets: [],
    };
    const merged = keepFailedLocaleRows(next, existing, ["fr"]);
    expect(merged.prints.map((row) => row.printKey)).toEqual([
      "dbscg:bt1-001",
      "dbscg:bt1-999",
    ]);
    expect(
      merged.titles.map((row) => `${row.printKey}:${row.lang}:${row.fullName}`),
    ).toEqual([
      "dbscg:bt1-001:en:Champa EN v2",
      "dbscg:bt1-001:fr:Champa",
      "dbscg:bt1-999:fr:Seulement FR",
    ]);
    expect(merged.assets.map((row) => row.art)).toEqual(["fr.png", "999.png"]);
  });

  it("changes nothing when every locale was read", () => {
    const next = { prints: [], titles: [], assets: [] };
    expect(keepFailedLocaleRows(next, existing, [])).toEqual(next);
    expect(keepFailedLocaleRows(next, null, ["fr"])).toEqual(next);
  });
});

describe("scrapeDbsCgCardlist retries", () => {
  beforeEach(() => {
    vi.mocked(httpGet).mockReset();
    vi.mocked(httpPost).mockReset();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries series POST after ECONNRESET instead of aborting the locale", async () => {
    vi.mocked(httpGet).mockResolvedValue({ data: indexHtml } as never);
    const hangUp = new axios.AxiosError("socket hang up");
    hangUp.code = "ECONNRESET";
    vi.mocked(httpPost)
      .mockRejectedValueOnce(hangUp)
      .mockResolvedValueOnce({ data: frFixture } as never);

    const result = await scrapeDbsCgCardlist({
      langs: ["fr"],
      delayMs: 0,
    });

    expect(result.printCount).toBe(1);
    expect(httpPost).toHaveBeenCalledTimes(2);
  });
});
