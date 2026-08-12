import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readFoilPackStatuses } from "./foilStatus";

const tmpDirs: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeRepo(): Promise<{ repo: string; data: string }> {
  const repo = await mkdtemp(path.join(os.tmpdir(), "foil-status-"));
  tmpDirs.push(repo);
  const data = path.join(repo, "data");
  await mkdir(data, { recursive: true });
  return { repo, data };
}

describe("readFoilPackStatuses", () => {
  it("reports missing APKs and no extract on empty data", async () => {
    const { repo, data } = await makeRepo();
    const packs = await readFoilPackStatuses({ dataRoot: data, repoRoot: repo });
    expect(packs).toHaveLength(2);
    expect(packs[0]).toMatchObject({
      id: "lorcana",
      apk: { present: false },
      extract: { present: false },
      canExtract: true,
    });
    expect(packs[1]).toMatchObject({
      id: "pokemon",
      apk: { present: false },
      extract: { present: false },
      canExtract: true,
    });
  });

  it("flags APK ready + extract present, and stale when APK is newer", async () => {
    const { utimes } = await import("node:fs/promises");
    const { repo, data } = await makeRepo();
    const apkDir = path.join(data, "lorcana", "staging", "apks");
    const shaders = path.join(data, "lorcana", "foil", "shaders");
    await mkdir(apkDir, { recursive: true });
    await mkdir(shaders, { recursive: true });
    const shaderPath = path.join(shaders, "CardFoil.frag");
    const apkPath = path.join(apkDir, "base.apk");
    await writeFile(shaderPath, "x".repeat(400));
    await writeFile(apkPath, "PK\x03\x04" + "y".repeat(100));
    const older = new Date("2020-01-01T00:00:00Z");
    const newer = new Date("2024-06-01T00:00:00Z");
    await utimes(shaderPath, older, older);
    await utimes(apkPath, newer, newer);

    const packs = await readFoilPackStatuses({ dataRoot: data, repoRoot: repo });
    const lorcana = packs.find((p) => p.id === "lorcana");
    expect(lorcana?.apk.present).toBe(true);
    expect(lorcana?.extract.present).toBe(true);
    expect(lorcana?.extract.stale).toBe(true);
    expect(lorcana?.canExtract).toBe(true);
    expect(lorcana?.extract.shaders).toBe(1);
  });
});
