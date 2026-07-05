#!/usr/bin/env node
/** Rewrite imports after core pillar consolidation. */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const REPLACEMENTS = [
  ["@/core/identify/", "@/core/identify/"],
  ["@/core/identify/platforms/", "@/core/identify/platforms/"],
  ["@/core/enrich/", "@/core/enrich/"],
  ["@/core/enrich/media/", "@/core/enrich/media/"],
  ["@/core/enrich/titles/", "@/core/enrich/titles/"],
  ["@/core/enrich/search/", "@/core/enrich/search/"],
  ["@/core/collect/", "@/core/collect/"],
  ["@/core/collect/jobs/", "@/core/collect/jobs/"],
  ["@/core/commerce/pricing/", "@/core/commerce/pricing/"],
  ["@/core/commerce/retailer/", "@/core/commerce/retailer/"],
];

const SCAN_ROOTS = [
  "src",
  "scripts",
  "tests",
  "docs",
  "prisma",
  "next.config.js",
  "package.json",
];
const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".md",
  ".mdc",
]);

function walk(target, files = []) {
  const abs = path.isAbsolute(target) ? target : path.join(ROOT, target);
  if (!fs.existsSync(abs)) return files;
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(abs))) files.push(abs);
    return files;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(child, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(child);
    }
  }
  return files;
}

function rewrite(text) {
  let out = text;
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  out = out.replaceAll("src/core/identify/", "src/core/identify/");
  out = out.replaceAll("src/core/enrich/", "src/core/enrich/");
  return out;
}

const files = SCAN_ROOTS.flatMap((root) => walk(root));
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = rewrite(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed++;
  }
}
console.log(`Updated ${changed} files`);
