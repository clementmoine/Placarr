import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/scrapeFetch", () => ({
  fetchTextWithFlareFallback: vi.fn(),
}));

const { fetchTextWithFlareFallback } = await import("@/lib/http/scrapeFetch");
const { probeSurugaVol1Listings } = await import("./probeSurugaVol1Listings");

describe("probeSurugaVol1Listings", () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.mocked(fetchTextWithFlareFallback).mockReset();
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("writes printed codes from Byparr HTML when Cloudflare blocks direct GET", async () => {
    vi.mocked(fetchTextWithFlareFallback).mockImplementation(async (url) => {
      if (url.endsWith("GL636810")) {
        return "<title>NARUTO 巻ノ壱 忍-1 うずまきナルト</title>";
      }
      return null;
    });
    const root = mkdtempSync(path.join(tmpdir(), "suruga-vol1-"));
    dirs.push(root);
    const result = await probeSurugaVol1Listings({
      root,
      start: 636_810,
      end: 636_810,
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
    expect(tsv).toContain("GL636810\t忍-1");
  });
});
