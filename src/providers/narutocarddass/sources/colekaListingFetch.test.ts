import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/scrapeFetch", () => ({
  fetchTextWithFlareFallback: vi.fn(),
}));

const { fetchTextWithFlareFallback } = await import("@/lib/http/scrapeFetch");
const { fetchColekaListingHtml } = await import(
  "@/providers/shared/coleka/listingFetch"
);

const WALL = "<title>Vérification</title><p>/verify/?lang=fr</p>";
const LISTING = `<html>${"x".repeat(500)}<a class="lib_has_2_lines">ok</a></html>`;

describe("fetchColekaListingHtml", () => {
  afterEach(() => {
    vi.mocked(fetchTextWithFlareFallback).mockReset();
  });

  it("refetches a cached verify wall instead of treating it as a stop", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "coleka-listing-"));
    const dest = path.join(dir, "s1-listing-1.html");
    mkdirSync(dir, { recursive: true });
    writeFileSync(dest, WALL, "utf8");
    vi.mocked(fetchTextWithFlareFallback).mockResolvedValue(LISTING);
    const html = await fetchColekaListingHtml(
      "https://www.coleka.com/x?p=1",
      dest,
      false,
    );
    expect(html).toContain("lib_has_2_lines");
    expect(fetchTextWithFlareFallback).toHaveBeenCalledOnce();
  });

  it("reuses a cached listing that is not a wall", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "coleka-listing-"));
    const dest = path.join(dir, "s1-listing-0.html");
    writeFileSync(dest, LISTING, "utf8");
    const html = await fetchColekaListingHtml(
      "https://www.coleka.com/x",
      dest,
      false,
    );
    expect(html).toBe(LISTING);
    expect(fetchTextWithFlareFallback).not.toHaveBeenCalled();
  });

  it("refetches a listing older than maxAgeMs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "coleka-listing-"));
    const dest = path.join(dir, "s1-listing-old.html");
    writeFileSync(dest, LISTING, "utf8");
    const past = Date.now() - 2 * 60 * 60 * 1000;
    const { utimesSync } = await import("node:fs");
    utimesSync(dest, past / 1000, past / 1000);
    vi.mocked(fetchTextWithFlareFallback).mockResolvedValue(
      `<html>${"y".repeat(500)}<a class="lib_has_2_lines">fresh</a></html>`,
    );
    const html = await fetchColekaListingHtml(
      "https://www.coleka.com/x",
      dest,
      false,
      { maxAgeMs: 60 * 60 * 1000 },
    );
    expect(html).toContain("fresh");
    expect(fetchTextWithFlareFallback).toHaveBeenCalledOnce();
  });

  it("falls back to a good cached page when a refetch hits the verify wall", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "coleka-listing-"));
    const dest = path.join(dir, "s1-listing-1.html");
    writeFileSync(dest, LISTING, "utf8");
    vi.mocked(fetchTextWithFlareFallback).mockResolvedValue(WALL);
    const html = await fetchColekaListingHtml(
      "https://www.coleka.com/x?p=1",
      dest,
      true,
    );
    expect(html).toBe(LISTING);
  });
});
