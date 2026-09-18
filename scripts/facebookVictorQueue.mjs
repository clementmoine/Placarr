/** Build Victor Husson catalog post queue from full crawl dump. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const dumpPath =
  process.argv[2] ??
  "/Users/clement.moine/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-09-02T12-34-40-617Z.json";
const outDir = path.resolve(
  "data/naruto/carddass/staging/facebook-naruto-collection-france",
);
mkdirSync(outDir, { recursive: true });

const raw = JSON.parse(readFileSync(dumpPath, "utf8"));
const payload = JSON.parse(raw.result.value);

const tagRe =
  /\[p'tite info\]|\[réception\]|\[Ma collection\]|\[vente\]|\[découverte\]|made in japan|ni-236|série 6|serie 6|duopack|display|sage's legacy|storm 3|carddass|coffret|scellé|tin box|pack decouverte|DVD|mythos|bandai français/i;

const posts = payload.posts.filter((p) => {
  const author = p.author ?? "";
  const text = p.text ?? "";
  if (author.includes("Victor Husson")) return tagRe.test(text);
  if (text.includes("Victor Husson") && tagRe.test(text)) return true;
  return false;
});

const queue = posts.map((p) => ({
  id: p.id,
  permalink: p.permalink,
  author: p.author,
  snippet: (p.text ?? "").slice(0, 200),
  tags: [...(p.text ?? "").matchAll(/\[[^\]]+\]/g)].map((m) => m[0]),
  needsPermalink: !p.permalink,
  needsDeepExtract: true,
}));

writeFileSync(
  path.join(outDir, "victor-catalog-queue-2026-09-02.json"),
  `${JSON.stringify({ count: queue.length, posts: queue }, null, 2)}\n`,
);
console.log(`queue=${queue.length} needPermalink=${queue.filter((p) => p.needsPermalink).length}`);
