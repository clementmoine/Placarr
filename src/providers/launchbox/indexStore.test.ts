import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isLaunchBoxDownloadAllowed,
  shouldBuildLaunchBoxIndex,
  __resetLaunchBoxIndexForTests,
} from "./indexStore";

describe("LaunchBox prebuild / download gate", () => {
  const originalAllow = process.env.LAUNCHBOX_ALLOW_DOWNLOAD;
  const originalXml = process.env.LAUNCHBOX_METADATA_XML;
  const originalCache = process.env.LAUNCHBOX_CACHE_DIR;
  const originalIndex = process.env.LAUNCHBOX_INDEX_PATH;

  beforeEach(() => {
    __resetLaunchBoxIndexForTests();
    delete process.env.LAUNCHBOX_ALLOW_DOWNLOAD;
    delete process.env.LAUNCHBOX_METADATA_XML;
    // Isolate from a developer machine's real .cache/launchbox.
    process.env.LAUNCHBOX_CACHE_DIR = "/tmp/placarr-launchbox-gate-missing";
    process.env.LAUNCHBOX_INDEX_PATH =
      "/tmp/placarr-launchbox-gate-missing/launchbox.sqlite";
  });

  afterEach(() => {
    __resetLaunchBoxIndexForTests();
    if (originalAllow === undefined)
      delete process.env.LAUNCHBOX_ALLOW_DOWNLOAD;
    else process.env.LAUNCHBOX_ALLOW_DOWNLOAD = originalAllow;
    if (originalXml === undefined) delete process.env.LAUNCHBOX_METADATA_XML;
    else process.env.LAUNCHBOX_METADATA_XML = originalXml;
    if (originalCache === undefined) delete process.env.LAUNCHBOX_CACHE_DIR;
    else process.env.LAUNCHBOX_CACHE_DIR = originalCache;
    if (originalIndex === undefined) delete process.env.LAUNCHBOX_INDEX_PATH;
    else process.env.LAUNCHBOX_INDEX_PATH = originalIndex;
  });

  it("disallows Metadata.zip download by default (scan path)", () => {
    expect(isLaunchBoxDownloadAllowed()).toBe(false);
    expect(shouldBuildLaunchBoxIndex()).toBe(false);
  });

  it("allows download when build options or env opt in", () => {
    expect(isLaunchBoxDownloadAllowed({ allowDownload: true })).toBe(true);
    expect(shouldBuildLaunchBoxIndex({ allowDownload: true })).toBe(true);

    process.env.LAUNCHBOX_ALLOW_DOWNLOAD = "1";
    expect(isLaunchBoxDownloadAllowed()).toBe(true);
    expect(shouldBuildLaunchBoxIndex()).toBe(true);
  });
});
