#!/usr/bin/env node
/**
 * Bulk-rewrite @/ imports after core structure migration.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const REPLACEMENTS = [
  ["@/providers/", "@/providers/"],
  ["@/core/catalog/", "@/core/catalog/"],
  ["@/core/metadata/", "@/core/metadata/"],
  ["@/core/barcode/", "@/core/barcode/"],
  ["@/core/pricing/", "@/core/pricing/"],
  ["@/core/barcode/", "@/core/barcode/"],
  ["@/core/metadata/", "@/core/metadata/"],
  ["@/core/pricing/", "@/core/pricing/"],
  ["@/core/catalog/", "@/core/catalog/"],
  ["@/core/item/", "@/core/item/"],
  ["@/core/media/", "@/core/media/"],
  ["@/core/title/", "@/core/title/"],
  ["@/core/locale/", "@/core/locale/"],
  ["@/core/jobs/", "@/core/jobs/"],
  ["@/core/games/", "@/core/games/"],
  ["@/core/retailer/", "@/core/retailer/"],
  ["@/core/search/", "@/core/search/"],
  ["@/lib/shared/", "@/lib/shared/"],
];

const SCAN_ROOTS = ["src", "scripts", "tests", "docs", "prisma"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md", ".mdc"]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(abs, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(abs);
    }
  }
  return files;
}

function rewrite(text) {
  let out = text;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  // Path strings in guard tests and docs
  out = out.replaceAll("src/providers", "src/providers");
  out = out.replaceAll("providers/", "providers/");
  return out;
}

let changed = 0;
for (const root of SCAN_ROOTS) {
  for (const file of walk(path.join(ROOT, root))) {
    const before = fs.readFileSync(file, "utf8");
    const after = rewrite(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed++;
    }
  }
}

console.log(`Updated ${changed} files`);
