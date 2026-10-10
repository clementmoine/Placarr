import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Client pages must not value-import the full provider registry (sharp, node:fs,
 * 90 provider modules). Type-only imports are fine; this walks the same edges
 * webpack follows for client chunks.
 */

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");
const APP = path.join(SRC, "app");

const FORBIDDEN_SUFFIXES = [
  `${path.sep}core${path.sep}catalog${path.sep}registry.ts`,
  `${path.sep}core${path.sep}catalog${path.sep}catalog.ts`,
  `${path.sep}identify${path.sep}platforms${path.sep}platformSources.ts`,
  `${path.sep}identify${path.sep}platforms${path.sep}data${path.sep}screenScraperPlatforms.json`,
] as const;

function listClientPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api") continue;
      listClientPages(full, out);
      continue;
    }
    if (entry.name === "page.tsx" || entry.name === "page.ts") {
      const text = readFileSync(full, "utf8");
      if (/^["']use client["']/.test(text.trimStart())) out.push(full);
    }
  }
  return out;
}

function extractValueImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  const re =
    /(?:^|\n)\s*(?:export\s+)?import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) continue;
    out.push(m[3]!);
  }
  const re2 =
    /(?:^|\n)\s*export\s+(?!type\b)[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = re2.exec(text))) out.push(m[1]!);
  // Dynamic import() is a separate chunk — not part of the eager page graph.
  return [...new Set(out)];
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) {
    return resolveFile(path.join(SRC, spec.slice(2)));
  }
  if (spec.startsWith(".")) {
    return resolveFile(path.resolve(path.dirname(fromFile), spec));
  }
  return null;
}

function resolveFile(base: string): string | null {
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // missing
    }
  }
  return null;
}

function walkValueImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of extractValueImports(file)) {
      const resolved = resolveImport(file, spec);
      if (resolved && resolved.startsWith(SRC)) queue.push(resolved);
    }
  }
  return seen;
}

describe("client page import graph", () => {
  const pages = listClientPages(APP);

  it("discovers client pages under src/app", () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  it.each(pages.map((p) => [path.relative(ROOT, p), p] as const))(
    "%s does not statically value-import registry / ScreenScraper platform JSON",
    (_label, pagePath) => {
      const files = walkValueImports(pagePath);
      const hits = [...files]
        .filter((f) =>
          FORBIDDEN_SUFFIXES.some((suffix) => f.endsWith(suffix)),
        )
        .map((f) => path.relative(ROOT, f));
      expect(hits).toEqual([]);
    },
  );
});
