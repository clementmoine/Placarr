/**
 * Parse Facebook group search CDP JSON and append normalized posts to staging jsonl.
 * Splits concatenated "Author · [tag] text" blobs when role=article is unavailable.
 */
import { appendFileSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const outDir = path.resolve(
  "data/naruto/carddass/staging/facebook-naruto-collection-france",
);
mkdirSync(outDir, { recursive: true });

const query = process.argv[2] ?? "unknown";
const inputPath = process.argv[3];
if (!inputPath) {
  console.error("usage: facebookGroupParseExtract.mjs <query> <cdp-json-file>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const payload =
  typeof raw.result?.value === "string"
    ? JSON.parse(raw.result.value)
    : typeof raw === "string"
      ? JSON.parse(raw)
      : raw;

const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

/** @type {Array<{author?: string|null, permalink?: string|null, text: string, imgs?: unknown[]}>} */
let posts = payload.posts ?? [];
if (posts.length === 1 && posts[0].text?.includes(" · ")) {
  const blob = posts[0].text.replace(/Facebook\s+/g, " ");
  const re =
    /([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ' -]{1,40})\s·\s/g;
  const hits = [...blob.matchAll(re)];
  if (hits.length >= 2) {
    posts = hits.map((m, i) => {
      const start = m.index + m[0].length;
      const end = hits[i + 1]?.index ?? blob.length;
      return {
        author: norm(m[1]),
        permalink: null,
        text: norm(blob.slice(start, end)),
      };
    });
  }
}

const record = {
  crawledAt: new Date().toISOString(),
  query,
  url: payload.url,
  postCount: posts.length,
  posts,
};
appendFileSync(
  path.join(outDir, "crawl-2026-09-02.jsonl"),
  `${JSON.stringify(record)}\n`,
);
console.log(`appended ${record.postCount} posts for query=${query}`);
