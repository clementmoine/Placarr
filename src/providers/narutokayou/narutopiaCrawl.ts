/**
 * Crawl Narutopia Kayou / Heritage checklist pages → curated face index.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { httpGet } from "@/lib/http/httpClient";
import { parseNarutopiaChecklistHtml } from "@/providers/shared/narutopia/parseChecklistPage";

import { narutoKayouCuratedDir } from "./pack";
import {
  buildNarutopiaKayouImageIndex,
  NARUTOPIA_KAYOU_PAGE_URLS,
  type NarutopiaKayouImageIndex,
} from "./narutopiaParse";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export const NARUTOPIA_KAYOU_INDEX_FILE = "narutopia-kayou-images.json";

export function narutopiaKayouImageIndexPath(): string {
  return path.join(
    narutoKayouCuratedDir(),
    "sources",
    NARUTOPIA_KAYOU_INDEX_FILE,
  );
}

export function readNarutopiaKayouImageIndex(): NarutopiaKayouImageIndex | null {
  try {
    return JSON.parse(
      readFileSync(narutopiaKayouImageIndexPath(), "utf8"),
    ) as NarutopiaKayouImageIndex;
  } catch {
    return null;
  }
}

export async function crawlNarutopiaKayouImageIndex(opts: {
  urls?: readonly string[];
  delayMs?: number;
} = {}): Promise<NarutopiaKayouImageIndex> {
  const urls = opts.urls ?? NARUTOPIA_KAYOU_PAGE_URLS;
  const delayMs = opts.delayMs ?? 120;
  const pages: { url: string; entries: ReturnType<typeof parseNarutopiaChecklistHtml> }[] =
    [];
  for (const url of urls) {
    try {
      const res = await httpGet<string>(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        timeout: 90_000,
      });
      pages.push({
        url,
        entries: parseNarutopiaChecklistHtml(String(res.data)),
      });
    } catch {
      pages.push({ url, entries: [] });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
  return buildNarutopiaKayouImageIndex(pages);
}

export async function runNarutopiaKayouCrawl(): Promise<{
  images: number;
  pages: number;
  changed: boolean;
}> {
  const pathOut = narutopiaKayouImageIndexPath();
  const prev = readNarutopiaKayouImageIndex();
  const next = await crawlNarutopiaKayouImageIndex();
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (changed) {
    mkdirSync(path.dirname(pathOut), { recursive: true });
    writeFileSync(pathOut, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
  return {
    images: next.images.length,
    pages: next.pages.length,
    changed,
  };
}
