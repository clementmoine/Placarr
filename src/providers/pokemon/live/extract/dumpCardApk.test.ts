import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { pokemonApkDumpFresh } from "./dumpCardApk";

describe("pokemonApkDumpFresh", () => {
  it("is true only when UV + back are not older than the APK", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apk-dump-"));
    const apk = path.join(root, "base.apk");
    const uv = path.join(root, "card-uv-rect.json");
    const back = path.join(root, "back.webp");
    writeFileSync(apk, "apk");
    writeFileSync(uv, "{}");
    writeFileSync(back, "webp");
    expect(pokemonApkDumpFresh({ apkPath: apk, uvRectPath: uv, cardBackPath: back })).toBe(
      true,
    );
  });

  it("is false when the APK is newer than the dump", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apk-dump-stale-"));
    const apk = path.join(root, "base.apk");
    const uv = path.join(root, "card-uv-rect.json");
    const back = path.join(root, "back.webp");
    writeFileSync(apk, "apk");
    writeFileSync(uv, "{}");
    writeFileSync(back, "webp");
    const older = new Date("2020-01-01T00:00:00Z");
    utimesSync(uv, older, older);
    utimesSync(back, older, older);
    expect(pokemonApkDumpFresh({ apkPath: apk, uvRectPath: uv, cardBackPath: back })).toBe(
      false,
    );
  });

  it("is false when a required artifact is missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "apk-dump-miss-"));
    const apk = path.join(root, "base.apk");
    writeFileSync(apk, "apk");
    expect(
      pokemonApkDumpFresh({
        apkPath: apk,
        uvRectPath: path.join(root, "missing.json"),
        cardBackPath: path.join(root, "missing.webp"),
      }),
    ).toBe(false);
  });
});
