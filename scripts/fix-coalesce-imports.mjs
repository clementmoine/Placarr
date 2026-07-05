#!/usr/bin/env node
/** Fix imports after module coalescing. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const REPLACEMENTS = [
  ["@/core/commerce/pricing/cachePolicy", "@/core/commerce/pricing/resolver"],
  ["@/core/commerce/pricing/outlierTrim", "@/core/commerce/pricing/resolver"],
  [
    "@/core/commerce/pricing/metadataPriceFallback",
    "@/core/commerce/pricing/itemDisplay",
  ],
  [
    "@/core/commerce/retailer/metadataAcceptance",
    "@/core/commerce/retailer/metadataLookup",
  ],
  ["@/core/enrich/mergeObservationRanking", "@/core/enrich/fetch"],
  ["@/core/enrich/metadataFetchGating", "@/core/enrich/fetch"],
  ["@/core/enrich/shelfContentLocale", "@/core/enrich/fetch"],
  ["@/core/enrich/bookSearch", "@/core/enrich/fetch"],
  ["@/core/enrich/bookSearchAliases", "@/core/enrich/fetch"],
  ["@/core/enrich/merge", "@/core/enrich/fetch"],
  ["@/core/enrich/imageDownload", "@/core/enrich/storage"],
  ["@/core/enrich/imageAssets", "@/core/enrich/storage"],
  ["./cachePolicy", "./resolver"],
  ["./outlierTrim", "./resolver"],
  ["./metadataPriceFallback", "./itemDisplay"],
  ["./materializeProviderInfo", "./catalog"],
  ["./metadataAcceptance", "./metadataLookup"],
  ["./bookSearch", "./fetch"],
  ["./bookSearchAliases", "./fetch"],
  ["./metadataFetchGating", "./fetch"],
  ["./consensusTitle", "./compile"],
  ["./resolve", "./compile"],
  ["@/core/identify/evidence/projections", "@/core/identify/evidence/ranking"],
];

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(p, files);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}

for (const file of walk(path.join(ROOT, "src"))) {
  let text = fs.readFileSync(file, "utf8");
  let next = text;
  for (const [from, to] of REPLACEMENTS) {
    next = next.split(from).join(to);
  }
  if (next !== text) fs.writeFileSync(file, next);
}

// Self-import cleanup in coalesced files
const selfClean = [
  [
    "src/core/catalog/catalog.ts",
    /import \{ materializeProviderInfo \} from "\.\/catalog";\n/,
  ],
  [
    "src/core/commerce/pricing/resolver.ts",
    /import \{ parsePriceProviderSources \} from "@\/core\/commerce\/pricing\/resolver";\n/,
  ],
  [
    "src/core/commerce/pricing/resolver.ts",
    /import \{[\s\S]*?\} from "@\/core\/commerce\/pricing\/resolver";\n/,
  ],
  [
    "src/core/commerce/retailer/metadataLookup.ts",
    /import \{ isRetailerCatalogTitleAccepted \} from "@\/core\/commerce\/retailer\/metadataLookup";\n/,
  ],
  [
    "src/core/identify/evidence/compile.ts",
    /import \{ selectConsensusTitle \} from "\.\/compile";\n/,
  ],
  [
    "src/core/enrich/fetch.ts",
    /export \{\n  pickBestMetadataFactsFromObservations,\n  pickBestMetadataTitle,\n\} from "@\/core\/enrich\/fetch";\nexport type \{ ProviderMetadataInput \} from "@\/core\/enrich\/fetch";\n\n/,
  ],
  [
    "src/core/enrich/fetch.ts",
    /\/\/ Re-exported so `@\/core\/enrich\/merge`[\s\S]*?export type \{ ProviderMetadataInput \} from "@\/core\/enrich\/fetch";\n\n/,
  ],
];

for (const [rel, pattern] of selfClean) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const next = text.replace(pattern, "");
  if (next !== text) fs.writeFileSync(file, next);
}

console.log("Fixed coalesce imports");
