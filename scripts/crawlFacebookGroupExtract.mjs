/** Parse CDP crawl JSON (stdout) and append to jsonl. Used by agent browser crawl. */
import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const outDir = path.resolve(
  "data/naruto/carddass/staging/facebook-naruto-collection-france",
);
mkdirSync(outDir, { recursive: true });

const query = process.argv[2] ?? "unknown";
const inputPath = process.argv[3];
if (!inputPath) {
  console.error("usage: crawlFacebookGroupExtract.mjs <query> <cdp-json-file>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const payload = JSON.parse(raw.result?.value ?? raw);
const record = {
  crawledAt: new Date().toISOString(),
  query,
  postCount: payload.count ?? payload.posts?.length ?? 0,
  posts: payload.posts ?? [],
};
appendFileSync(
  path.join(outDir, "crawl-2026-09-02.jsonl"),
  `${JSON.stringify(record)}\n`,
);
console.log(`appended ${record.postCount} posts for query=${query}`);
