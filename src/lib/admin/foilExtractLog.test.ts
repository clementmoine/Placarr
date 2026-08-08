import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tmpDirs: string[] = [];

beforeEach(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "foil-log-"));
  tmpDirs.push(root);
  vi.stubEnv("PLACARR_DATA_DIR", root);
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("foilExtractLog", () => {
  it("writes and tails the pack extract log", async () => {
    const {
      appendFoilExtractLog,
      beginFoilExtractLog,
      foilExtractLogPath,
      readFoilExtractLog,
    } = await import("./foilExtractLog");

    await beginFoilExtractLog("pokemon", ["jobId=test"]);
    await appendFoilExtractLog("pokemon", "line one");
    await appendFoilExtractLog("pokemon", "line two");

    const file = foilExtractLogPath("pokemon");
    expect(file).toContain(path.join("pokemon", "logs", "foil-extract.log"));
    const raw = await readFile(file, "utf8");
    expect(raw).toContain("jobId=test");
    expect(raw).toContain("line one");

    const first = await readFoilExtractLog("pokemon", { after: 0 });
    expect(first.exists).toBe(true);
    expect(first.text).toContain("line two");
    expect(first.launchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(first.mtime).toBeTruthy();

    const second = await readFoilExtractLog("pokemon", {
      after: first.nextOffset,
    });
    expect(second.text).toBe("");
    expect(second.nextOffset).toBe(first.nextOffset);
  });
});
