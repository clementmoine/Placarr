import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Server-side HTTP must go through `httpClient` so every call gets a timeout,
 * the ambient job abort signal, and in-flight de-duplication. Browser code
 * (`src/app`, `src/components`, `src/lib/api`, …) talks to our own API and is
 * out of scope.
 */
const GUARDED_ROOTS = ["src/providers", "src/core"];
const ALLOWED = new Set(["src/lib/http/httpClient.ts"]);
const DIRECT_CALL = /\baxios\.(get|post|request|put|patch|delete)\s*[<(]/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") && !full.includes(".test.") ? [full] : [];
  });
}

describe("shared HTTP client", () => {
  it("is the only way providers and core reach the network", () => {
    const offenders = GUARDED_ROOTS.flatMap((root) => walk(root))
      .map((file) => relative(process.cwd(), file))
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => DIRECT_CALL.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});
