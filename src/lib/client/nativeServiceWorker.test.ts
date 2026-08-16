import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("service worker", () => {
  it("is not shipped — no worker file, no Serwist toolchain", () => {
    expect(existsSync("public/sw.js")).toBe(false);
    expect(existsSync("src/app/sw.ts")).toBe(false);

    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).not.toMatch(/serwist/i);

    const nextConfig = readFileSync("next.config.js", "utf8");
    expect(nextConfig).not.toMatch(/serwist/i);
    expect(nextConfig).not.toMatch(/withSerwist/);
  });
});
