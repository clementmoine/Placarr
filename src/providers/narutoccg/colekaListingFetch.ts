/**
 * Coleka listing HTML: later pages trip a verify wall on a direct GET.
 * Cached wall HTML is stale — refetch through FlareSolverr.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fetchTextWithFlareFallback } from "@/lib/http/scrapeFetch";

import { colekaHtmlIsVerifyWall } from "./parseColekaStorm3";

export async function fetchColekaListingHtml(
  url: string,
  dest: string,
  force: boolean,
): Promise<string | null> {
  if (!force && existsSync(dest)) {
    const cached = readFileSync(dest, "utf8");
    if (cached.length > 400 && !colekaHtmlIsVerifyWall(cached)) return cached;
  }
  const html = await fetchTextWithFlareFallback(url, {
    flareMaxTimeoutMs: 60_000,
  });
  if (!html || html.length < 400 || colekaHtmlIsVerifyWall(html)) return null;
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, html, "utf8");
  return html;
}
