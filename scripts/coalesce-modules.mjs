#!/usr/bin/env node
/**
 * Merge source module into target (append body, merge imports, delete source).
 * Usage: node scripts/coalesce-modules.mjs target.ts source.ts [source2.ts ...]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: coalesce-modules.mjs <target.ts> <source.ts> [...]");
  process.exit(1);
}

const targetPath = path.resolve(ROOT, args[0]);
const sourcePaths = args.slice(1).map((p) => path.resolve(ROOT, p));

function splitImports(content) {
  const lines = content.split("\n");
  const imports = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("import ") || line.startsWith("import{")) {
      let block = line;
      while (!block.includes(";") && i + 1 < lines.length) {
        i++;
        block += `\n${lines[i]}`;
      }
      imports.push(block.trim());
      i++;
      continue;
    }
    if (line.trim() === "" && imports.length > 0 && i < 20) {
      i++;
      continue;
    }
    break;
  }
  return { imports, body: lines.slice(i).join("\n").trimStart() };
}

function mergeImports(targetContent, newImports) {
  const { imports: targetImports, body: targetBody } =
    splitImports(targetContent);
  const existing = new Set(targetImports);
  const merged = [...targetImports];
  for (const imp of newImports) {
    if (!existing.has(imp) && !targetContent.includes(imp)) {
      merged.push(imp);
      existing.add(imp);
    }
  }
  return `${merged.join("\n")}\n\n${targetBody}`;
}

let targetContent = fs.readFileSync(targetPath, "utf8");

for (const sourcePath of sourcePaths) {
  const sourceContent = fs.readFileSync(sourcePath, "utf8");
  const { imports, body } = splitImports(sourceContent);
  const sourceRel = path.relative(ROOT, sourcePath);
  targetContent = mergeImports(
    targetContent,
    imports.filter(
      (imp) => !imp.includes(`from "./${path.basename(sourcePath, ".ts")}"`),
    ),
  );
  targetContent = targetContent.replace(
    /from ["']\.\/mergeObservationRanking["'];?\n/g,
    "",
  );
  targetContent = targetContent.replace(
    /export \{[^}]+\} from ["']\.\/mergeObservationRanking["'];?\n/g,
    "",
  );
  targetContent = targetContent.replace(
    /export type \{ ProviderMetadataInput \} from ["']\.\/mergeObservationRanking["'];?\n/g,
    "",
  );
  targetContent += `\n\n// ── coalesced from ${sourceRel} ──\n\n${body}\n`;
  fs.unlinkSync(sourcePath);
  console.log(`Merged ${sourceRel} → ${path.relative(ROOT, targetPath)}`);
}

fs.writeFileSync(targetPath, targetContent);
