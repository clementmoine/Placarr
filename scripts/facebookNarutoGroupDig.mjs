#!/usr/bin/env node
/**
 * Facebook « Naruto Collection France » dig — one action file (was 7 scripts).
 *
 * Staging: data/naruto/carddass/staging/facebook-naruto-collection-france/
 *
 * usage:
 *   node scripts/facebookNarutoGroupDig.mjs append-crawl <query> <cdp-json>
 *   node scripts/facebookNarutoGroupDig.mjs parse-search <query> <cdp-json>
 *   node scripts/facebookNarutoGroupDig.mjs merge-batch <batch-json> [passName]
 *   node scripts/facebookNarutoGroupDig.mjs victor-queue [cdp-dump-json]
 *   node scripts/facebookNarutoGroupDig.mjs victor-save <extract-json>
 *   node scripts/facebookNarutoGroupDig.mjs print-deep-extract-js
 *   node scripts/facebookNarutoGroupDig.mjs print-priority-posts
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve(
  "data/naruto/carddass/staging/facebook-naruto-collection-france",
);
const GROUP =
  "https://www.facebook.com/groups/805799330361374";

const PRIORITY_POSTS = [
  { id: "1246941432913826", slug: "ni236-ptite-info", path: "permalink" },
  { id: "1248487462759223", slug: "jordan-mij-thread", path: "permalink" },
  { id: "1121246878816616", slug: "ma-collection-videos", path: "posts" },
  { id: "1228068058134497", slug: "promo-card-exclusive", path: "posts" },
  { id: "1239180660356570", slug: "tin-holo-tempete", path: "posts" },
  { id: "1242066306734672", slug: "storm3-will-of-fire-price", path: "posts" },
  { id: "1167735117501125", slug: "boite-metal-fr", path: "posts" },
  { id: "957314205209885", slug: "displays-resurface", path: "posts" },
  { id: "867083010899672", slug: "display-storm3-only", path: "posts" },
  { id: "843560099918630", slug: "collection-fr-only", path: "posts" },
  { id: "825206098420697", slug: "items-scelle-advice", path: "posts" },
];

const DEEP_EXTRACT_JS = String.raw`
(async () => {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const safeExpand = () => {
    for (const b of document.querySelectorAll('[role="button"]')) {
      const t = norm(b.innerText);
      if (t === 'En voir plus' || t === 'Voir plus') try { b.click(); } catch (e) {}
      if (/^\d+ réponses$/.test(t) || /^Voir plus de commentaires$/.test(t)) try { b.click(); } catch (e) {}
    }
  };
  safeExpand();
  await new Promise(r => setTimeout(r, 400));
  safeExpand();
  const main = document.querySelector('[role="dialog"] [role="main"]')
    || document.querySelector('[role="main"]')
    || document.body;
  const text = norm(main.innerText).replace(/Facebook\s+/g, ' ');
  const imgs = [...document.querySelectorAll('img[src*="scontent"]')]
    .map(i => ({ alt: i.alt || '', src: (i.src || '').split('?')[0].slice(0, 200) }))
    .filter(x => x.alt && !/profile picture/i.test(x.alt))
    .slice(0, 24);
  const tag = [...text.matchAll(/\[[^\]]+\]/g)].map(m => m[0]).slice(0, 8);
  return JSON.stringify({
    permalink: location.href.split('?')[0],
    tag,
    text: text.slice(0, 20000),
    imageCount: imgs.length,
    images: imgs,
  });
})()
`;

function ensureOut() {
  mkdirSync(OUT_DIR, { recursive: true });
}

function norm(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function parseCdpPayload(raw) {
  if (typeof raw.result?.value === "string") return JSON.parse(raw.result.value);
  if (raw.result?.value && typeof raw.result.value === "object") {
    return raw.result.value;
  }
  if (typeof raw === "string") return JSON.parse(raw);
  return raw;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function usage() {
  console.error(`usage:
  node scripts/facebookNarutoGroupDig.mjs append-crawl <query> <cdp-json>
  node scripts/facebookNarutoGroupDig.mjs parse-search <query> <cdp-json>
  node scripts/facebookNarutoGroupDig.mjs merge-batch <batch-json> [passName]
  node scripts/facebookNarutoGroupDig.mjs victor-queue [cdp-dump-json]
  node scripts/facebookNarutoGroupDig.mjs victor-save <extract-json>
  node scripts/facebookNarutoGroupDig.mjs print-deep-extract-js
  node scripts/facebookNarutoGroupDig.mjs print-priority-posts`);
  process.exit(1);
}

function appendCrawl(query, inputPath) {
  ensureOut();
  const payload = parseCdpPayload(readJson(inputPath));
  const record = {
    crawledAt: new Date().toISOString(),
    query,
    postCount: payload.count ?? payload.posts?.length ?? 0,
    posts: payload.posts ?? [],
  };
  appendFileSync(
    path.join(OUT_DIR, "crawl-2026-09-02.jsonl"),
    `${JSON.stringify(record)}\n`,
  );
  console.log(`appended ${record.postCount} posts for query=${query}`);
}

function parseSearch(query, inputPath) {
  ensureOut();
  const payload = parseCdpPayload(readJson(inputPath));
  let posts = payload.posts ?? [];
  if (posts.length === 1 && posts[0].text?.includes(" · ")) {
    const blob = posts[0].text.replace(/Facebook\s+/g, " ");
    const re = /([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ' -]{1,40})\s·\s/g;
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
    path.join(OUT_DIR, "crawl-2026-09-02.jsonl"),
    `${JSON.stringify(record)}\n`,
  );
  console.log(`appended ${record.postCount} posts for query=${query}`);
}

function mergeBatch(inputPath, passName) {
  ensureOut();
  const payload = parseCdpPayload(readJson(inputPath));
  const indexPath = path.join(OUT_DIR, "post-index-2026-09-02.json");
  const index = existsSync(indexPath)
    ? readJson(indexPath)
    : { ids: {}, count: 0 };

  let added = 0;
  for (const post of payload.posts ?? []) {
    const id =
      post.id ??
      post.permalink?.match(/(?:posts|permalink)\/(\d+)/)?.[1] ??
      `${norm(post.author)}|${norm(post.text).slice(0, 120)}`;
    if (index.ids[id]) continue;
    index.ids[id] = true;
    added += 1;
    appendFileSync(
      path.join(OUT_DIR, "crawl-2026-09-02.jsonl"),
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
}

function victorQueue(dumpPath) {
  ensureOut();
  const raw = readJson(dumpPath);
  const payload = parseCdpPayload(raw);
  const tagRe =
    /\[p'tite info\]|\[réception\]|\[Ma collection\]|\[vente\]|\[découverte\]|made in japan|ni-236|série 6|serie 6|duopack|display|sage's legacy|storm 3|carddass|coffret|scellé|tin box|pack decouverte|DVD|mythos|bandai français/i;

  const posts = (payload.posts ?? []).filter((p) => {
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
    path.join(OUT_DIR, "victor-catalog-queue-2026-09-02.json"),
    `${JSON.stringify({ count: queue.length, posts: queue }, null, 2)}\n`,
  );
  console.log(
    `queue=${queue.length} needPermalink=${queue.filter((p) => p.needsPermalink).length}`,
  );
}

function victorSave(inputPath) {
  ensureOut();
  const payload = parseCdpPayload(readJson(inputPath));
  appendFileSync(
    path.join(OUT_DIR, "victor-deep-2026-09-02.jsonl"),
    `${JSON.stringify({ crawledAt: new Date().toISOString(), ...payload })}\n`,
  );
  console.log(
    `saved ${payload.permalink ?? payload.id ?? "?"} len=${(payload.text ?? "").length}`,
  );
}

function main() {
  const cmd = process.argv[2];
  if (!cmd) usage();

  switch (cmd) {
    case "append-crawl": {
      const query = process.argv[3];
      const input = process.argv[4];
      if (!query || !input) usage();
      appendCrawl(query, input);
      break;
    }
    case "parse-search": {
      const query = process.argv[3];
      const input = process.argv[4];
      if (!query || !input) usage();
      parseSearch(query, input);
      break;
    }
    case "merge-batch": {
      const input = process.argv[3];
      const passName = process.argv[4] ?? "full-feed";
      if (!input) usage();
      mergeBatch(input, passName);
      break;
    }
    case "victor-queue": {
      const dump =
        process.argv[3] ??
        "/Users/clement.moine/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-09-02T12-34-40-617Z.json";
      victorQueue(dump);
      break;
    }
    case "victor-save": {
      const input = process.argv[3];
      if (!input) usage();
      victorSave(input);
      break;
    }
    case "print-deep-extract-js":
      process.stdout.write(DEEP_EXTRACT_JS);
      break;
    case "print-priority-posts":
      console.log(
        JSON.stringify(
          PRIORITY_POSTS.map((p) => ({
            ...p,
            url: `${GROUP}/${p.path}/${p.id}/`,
          })),
          null,
          2,
        ),
      );
      break;
    default:
      usage();
  }
}

main();
