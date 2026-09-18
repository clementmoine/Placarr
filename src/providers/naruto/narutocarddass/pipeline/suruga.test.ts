import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { carddasJpCardlistCards } from "../parse/bandai";

vi.mock("@/lib/http/scrapeFetch", () => ({
  fetchTextWithFlareFallback: vi.fn(),
}));

// —— probeSurugaVol1Listings ——
{
  const { fetchTextWithFlareFallback } = await import("@/lib/http/scrapeFetch");
  const { probeSurugaVol1Listings } = await import("./suruga");

  describe("probeSurugaVol1Listings", () => {
    const dirs: string[] = [];

    afterEach(() => {
      vi.mocked(fetchTextWithFlareFallback).mockReset();
      for (const dir of dirs.splice(0))
        rmSync(dir, { recursive: true, force: true });
    });

    it("writes printed codes from Byparr HTML when Cloudflare blocks direct GET", async () => {
      vi.mocked(fetchTextWithFlareFallback).mockImplementation(async (url) => {
        if (url.endsWith("GL636800")) {
          return "<title>NARUTO 巻ノ壱 忍-1 うずまきナルト</title>";
        }
        return null;
      });
      const root = mkdtempSync(path.join(tmpdir(), "suruga-vol1-"));
      dirs.push(root);
      const result = await probeSurugaVol1Listings({
        root,
        start: 636_800,
        end: 636_800,
        delayMs: 0,
        force: true,
      });
      expect(result).toEqual({ probed: 1, added: 1, skipped: 0, failed: 0 });
      const tsv = readFileSync(
        path.join(
          root,
          "naruto/carddass/staging/suruga-ya-carddass/vol1-probes.tsv",
        ),
        "utf8",
      );
      expect(tsv).toContain("GL636800\t忍-1");
    });
  });
}

// —— probeSurugaMissingVol1 ——
{
  describe("probeSurugaMissingVol1 targets", () => {
    it("vol1 checklist includes 忍-3 as ni0003", () => {
      const row = carddasJpCardlistCards().find((c) => c.printed === "忍-3");
      expect(row).toMatchObject({ number: "ni0003", setCode: "maki1" });
    });
  });
}

