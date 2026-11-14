import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const h = vi.hoisted(() => ({
  httpGet: vi.fn(),
}));

vi.mock("@/lib/http/httpClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/http/httpClient")>();
  return {
    ...actual,
    httpGet: h.httpGet,
  };
});

import {
  fetchChitoroProducts,
  loadStorm3Ledger,
  storm3LedgerPath,
  ultrajeuxWaybackUrl,
} from "./marketplace";
import { readNarutoCarddassSyncedSource } from "../syncedSources";

const ledger = readNarutoCarddassSyncedSource("ultrajeux-s5.json");

describe("fetchChitoroProducts", () => {
  afterEach(() => {
    h.httpGet.mockReset();
    vi.restoreAllMocks();
  });

  it("soft-returns [] after Shopify 429 instead of aborting jap densify", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.httpGet.mockRejectedValue(
      new axios.AxiosError(
        "Request failed with status code 429",
        "ERR_BAD_REQUEST",
        undefined,
        undefined,
        {
          status: 429,
          statusText: "Too Many Requests",
          headers: {},
          config: {} as never,
          data: { errors: ["Exceeded"] },
        },
      ),
    );
    await expect(fetchChitoroProducts()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    // 429 is not retryable — one attempt then soft-empty.
    expect(h.httpGet).toHaveBeenCalledTimes(1);
  });
});


// —— scrapeStorm3 ——
{
  describe("loadStorm3Ledger", () => {
    it("reads staging/stop2shop-uns3 under the pack root (not nested twice)", () => {
      const packDir = mkdtempSync(path.join(tmpdir(), "naruto-storm3-"));
      const dest = storm3LedgerPath(packDir);
      expect(dest).toBe(
        path.join(packDir, "staging", "stop2shop-uns3", "cards.json"),
      );
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        JSON.stringify({
          cards: [
            {
              number: "n1685",
              cardType: "n",
              name: "MADARA UCHIHA",
              rarity: "super rare",
              productPath: "/n1685.html",
            },
          ],
        }),
        "utf8",
      );
      expect(loadStorm3Ledger(packDir).map((c) => c.number)).toEqual(["n1685"]);
    });
  });
}

// —— scrapeUltrajeuxS5 ——
{
  describe("Ultrajeux S5 holes", () => {
    it("targets the six CDX-missing official scans, not the whole serie_5 tree", () => {
      expect(ledger.ingest).toBe("s5-holes");
      expect(ledger.holes.map((row) => row.number)).toEqual([
        "ni232",
        "ni236",
        "ni252",
        "ni253",
        "ta221",
        "ta226",
      ]);
      expect(ultrajeuxWaybackUrl("ta-221.jpg", "20190228114039")).toContain(
        "/serie_5/ta-221.jpg",
      );
      expect(ultrajeuxWaybackUrl("ta-221.jpg", "20190228114039")).toContain(
        "20190228114039id_",
      );
    });
  });
}

