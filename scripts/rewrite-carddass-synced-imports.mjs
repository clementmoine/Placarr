#!/usr/bin/env node
/**
 * Rewrite static curated/sources imports → readNarutoCarddassSyncedSource
 * for files already present under data/naruto/carddass/sources/.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data/naruto/carddass/sources");
const providerRoot = path.join(root, "src/providers/naruto/narutocarddass");

const moved = new Set(
  readdirSync(dataDir).filter((n) => n.endsWith(".json")),
);

const importLineRe =
  /^import\s+(\w+)\s+from\s+["']((?:\.\.\/)+|\.\/)curated\/sources\/([^"']+\.json)["']\s*;\s*$/;

function lastImportStatementEnd(lines) {
  let lastEnd = -1;
  let inImport = false;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^import\s/.test(line)) {
      inImport = true;
      depth = 0;
    }
    if (!inImport) continue;
    for (const ch of line) {
      if (ch === "{" || ch === "(") depth += 1;
      else if (ch === "}" || ch === ")") depth -= 1;
    }
    if (line.includes(";") && depth <= 0) {
      lastEnd = i;
      inImport = false;
    }
  }
  return lastEnd;
}

function rewriteFile(filePath) {
  const original = readFileSync(filePath, "utf8");
  if (!original.includes("curated/sources/")) return false;

  const lines = original.split("\n");
  const loaders = [];
  const out = [];
  let touched = false;

  for (const line of lines) {
    const m = line.match(importLineRe);
    if (m && moved.has(m[3])) {
      loaders.push(
        `const ${m[1]} = readNarutoCarddassSyncedSource(${JSON.stringify(m[3])});`,
      );
      touched = true;
      continue;
    }
    out.push(line);
  }
  if (!touched) return false;

  const rel = path
    .relative(path.dirname(filePath), path.join(providerRoot, "syncedSources.ts"))
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  const spec = rel.startsWith(".") ? rel : `./${rel}`;
  const importLine = `import { readNarutoCarddassSyncedSource } from "${spec}";`;

  if (!out.some((l) => /from ["'].*syncedSources["']/.test(l))) {
    const end = lastImportStatementEnd(out);
    if (end >= 0) out.splice(end + 1, 0, importLine);
    else out.unshift(importLine);
  }

  const end = lastImportStatementEnd(out);
  const insertAt = end + 1;
  out.splice(insertAt, 0, "", ...loaders, "");

  writeFileSync(filePath, out.join("\n"));
  return true;
}

function walk(dir) {
  let n = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "curated" || ent.name === "syncedSources.ts") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) n += walk(p);
    else if (/\.tsx?$/.test(ent.name) && rewriteFile(p)) {
      console.log("rewrote", path.relative(root, p));
      n += 1;
    }
  }
  return n;
}

console.log("moved ledgers available:", moved.size);
console.log("files rewritten:", walk(providerRoot));
