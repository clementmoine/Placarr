#!/usr/bin/env node
/**
 * One-shot: move non-dig Carddass curated/sources JSON → data/naruto/carddass/sources
 * and rewrite static imports to readNarutoCarddassSyncedSource().
 *
 * Digs / attested maps stay curated (static import).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const curatedDir = path.join(
  root,
  "src/providers/naruto/narutocarddass/curated/sources",
);
const dataDir = path.join(root, "data/naruto/carddass/sources");
const providerRoot = path.join(root, "src/providers/naruto/narutocarddass");

/** Keep in curated — digs, attested id maps, reconstructions. */
const KEEP_RE =
  /(?:^|[-_])(hunt|wayback|facebook|youtube|reconstructed|attested|title-correction|face-collision|tin-box|orphan|archaeology|gaps-web|qty-web|pass\d|physical-finishes|landscape-prints|user-physical|starter-box-accessories|sources-evaluated|supplemental-sources|chat-links|collection-naruto|kana-manga|rakuten-tin|slab-z-2002|dream-hobby|hobbysearch|juggernauts|manga-news|mawo-cards|montreal|neokyo|primal-tcg|puja39|reddit-narutoccg|retrotcg|scifi-universe|ultrajeux-sealed|vintage-naruto|vialudibunda|tradecardsonline|toywiz|sunnystore|ps-yoyaku|potomac|micromania|martina|liveinternet|lineage2|leboncoin|kinkai|gradedcardcenter|goat-en-ccg|goat-locale|gamexfood|fnac|emporiodimilo|comicplanet|collectors-comet|band-of-the-hawk|aventuras|amigo-de|animecollection-fr-forum|cartes-naruto-com|detruire-konoha|en-ccg-s5|en-ccg-tp3|es-carddass|eu-ccg-pack|face-collisions|jp-boosters|kayou-drive|kingslayer|pack-decouverte|s5-starter|suruga-scan|suruga-ya-kaitori|tcgrepublic|trictrac|yahoo-shopping|tv-tokyo-naruto|tvtokyo-goods|stop2shop|naruto-ccg-app|naruto-ccg-drive|naruto-ccg-fansets|narutocards-ca|narutozabuza|noihjp|fandom-en|tcdb-en|bgg-en|atomicempire|avalon-shop|bandai-fr-us-drive|bandai-com|carddas20-pro|carddas20-promo|cardcheckbox-datacarddass|carddass-fr-starter|chitoroshop-jp|coleka-en-ccg|coleka-fr-starters|coleka-holo-type|coleka-s24|coleka-s28|coleka-s6-it|coleka-us-promos|en-ccg-series|fanset-en-titles|sets\.json)/i;

function isKeep(fileName) {
  if (fileName === "sets.json") return true;
  if (/^coleka-s\d/.test(fileName)) return true;
  if (fileName === "coleka-us-promos.json") return true;
  if (fileName === "coleka-holo-type.json") return true;
  if (fileName === "title-corrections.json") return true;
  if (fileName.endsWith(".ts") || fileName.endsWith(".md")) return true;
  return KEEP_RE.test(fileName);
}

mkdirSync(dataDir, { recursive: true });

const moved = [];
for (const name of readdirSync(curatedDir)) {
  if (!name.endsWith(".json")) continue;
  if (isKeep(name)) continue;
  const from = path.join(curatedDir, name);
  const to = path.join(dataDir, name);
  if (existsSync(to)) {
    // Prefer existing data copy; drop curated duplicate.
    spawnSync("git", ["rm", "-f", "--ignore-unmatch", from], {
      cwd: root,
      stdio: "ignore",
    });
    if (existsSync(from)) {
      // untracked leftover
      renameSync(from, `${from}.bak-migrated`);
    }
  } else {
    renameSync(from, to);
    spawnSync("git", ["rm", "-f", "--ignore-unmatch", from], {
      cwd: root,
      stdio: "ignore",
    });
  }
  moved.push(name);
}

console.log(`moved ${moved.length} ledgers → data/naruto/carddass/sources`);

const importRe =
  /import\s+(\w+)\s+from\s+["']((?:\.\.\/)*\.?\.?\/?curated\/sources\/([^"']+\.json))["']\s*;/g;

function rewriteFile(filePath) {
  let src = readFileSync(filePath, "utf8");
  if (!src.includes("curated/sources/")) return false;
  let changed = 0;
  const next = src.replace(importRe, (full, ident, _rel, fileName) => {
    if (isKeep(fileName) || !moved.includes(fileName)) return full;
    changed += 1;
    return `const ${ident} = readNarutoCarddassSyncedSource(${JSON.stringify(fileName)});`;
  });
  if (!changed) return false;
  let out = next;
  if (!/from ["'].*syncedSources["']/.test(out)) {
    const rel = path
      .relative(path.dirname(filePath), path.join(providerRoot, "syncedSources.ts"))
      .replace(/\\/g, "/")
      .replace(/\.ts$/, "");
    const spec = rel.startsWith(".") ? rel : `./${rel}`;
    const importLine = `import { readNarutoCarddassSyncedSource } from "${spec}";\n`;
    // Insert after the last remaining top-level import.
    let lastImportEnd = 0;
    const lineRe = /^import\s.+$/gm;
    let m;
    while ((m = lineRe.exec(out))) {
      lastImportEnd = m.index + m[0].length;
    }
    if (lastImportEnd > 0) {
      out =
        out.slice(0, lastImportEnd) +
        "\n" +
        importLine +
        out.slice(lastImportEnd).replace(/^\n*/, "\n");
    } else {
      out = importLine + out;
    }
  }
  writeFileSync(filePath, out);
  return true;
}

function walk(dir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name === "curated" || name.name === "node_modules") continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name.name)) rewriteFile(p);
  }
}

walk(providerRoot);
console.log("rewrote imports under narutocarddass/");
console.log("sample moved:", moved.slice(0, 15).join(", "));
