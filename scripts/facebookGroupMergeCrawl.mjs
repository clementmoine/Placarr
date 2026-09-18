/**
 * Merge/dedupe full crawl batches into staging jsonl.
 * usage: node scripts/facebookGroupMergeCrawl.mjs <batch-json-file> [passName]
 */
import {
  appendFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import path from "node:path";

const outDir = path.resolve(
  "data/naruto/carddass/staging/facebook-naruto-collection-france",
);
mkdirSync(outDir, { recursive: true });

const passName = process.argv[3] ?? "full-feed";
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: facebookGroupMergeCrawl.mjs <batch-json> [passName]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(inputPath, "utf8"));
const payload =
  typeof raw.result?.value === "string"
    ? JSON.parse(raw.result.value)
    : raw.result?.value && typeof raw.result.value === "object"
      ? raw.result.value
      : raw;

const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
const indexPath = path.join(outDir, "post-index-2026-09-02.json");
const index = existsSync(indexPath)
  ? JSON.parse(readFileSync(indexPath, "utf8"))
  : { ids: {}, count: 0 };

let added = 0;
for (const post of payload.posts ?? []) {
  const id =
    post.id ??
    post.permalink?.match(/(?:posts|permalink)\/(\d+)/)?.[1] ??
    `${norm(post.author)}|${norm(post.text).slice(0, 120)}`;
  if (index.ids[id]) continue;
  index.ids[id] = true;
  added++;
  appendFileSync(
    path.join(outDir, "crawl-2026-09-02.jsonl"),
    `${JSON.stringify({
      crawledAt: new Date().toISOString(),
      query: passName,
      url: payload.url,
      postCount: 1,
      posts: [post],
    })}\n`,
  );
}
index.count = Object.keys(index.ids).length;
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(
  `pass=${passName} batch=${payload.posts?.length ?? 0} new=${added} total=${index.count} scrollY=${payload.scrollY ?? "?"}`,
);
